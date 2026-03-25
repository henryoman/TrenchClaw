import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  stepCountIs,
  streamText,
  tool,
  validateUIMessages,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { z } from "zod";
import type { GatewayLane } from "../../ai/gateway";
import { createActionContext } from "../../ai/contracts/types/context";
import { createChatMessageId, createToolCallId } from "../../ai/contracts/types/ids";
import type { RuntimeToolSnapshot } from "../../tools";
import type { RuntimeLogger } from "../logger";
import { WORKSPACE_TOOL_NAMES, createWorkspaceBashTools, resolveDefaultWorkspaceBashRoot } from "../../tools/workspace/bash";
import type { RuntimeGateway } from "../../ai/gateway";
import type {
  ActionDispatcher,
  ActionRegistry,
  RuntimeEventBus,
  StateStore,
} from "../../ai";
import type {
  RuntimeJobControlRequest,
  RuntimeJobEnqueueRequest,
} from "../../ai/contracts/types/context";
import type { convertToModelMessages as convertToModelMessagesFn, generateText as generateTextFn, streamText as streamTextFn } from "ai";
import {
  DEFAULT_CONVERSATION_HISTORY_SLICE_LIMIT,
  DEFAULT_CONVERSATION_HISTORY_SLICE_TOKEN_BUDGET,
  DEFAULT_CONVERSATION_HISTORY_TOKEN_BUDGET,
  excludeCurrentConversationOverlap,
  isReplayableUiMessage,
  replayChatMessageState,
  selectConversationHistoryMessages,
  tagHistoryUiMessagesForModelContext,
} from "./history";
import {
  getModelToolEnvelopeSchema,
  normalizeModelToolEnvelopeInput,
} from "../../tools/model";
import {
  createDirectTextStreamResponse,
  createDirectToolResultStreamResponse,
  formatKnownToolOnlyCompletionText,
  formatWalletContentsFastPathText,
  formatWalletContentsRateLimitText,
  formatWalletInventoryFastPathText,
  shouldUseWalletContentsFastPath,
  shouldUseWalletInventoryFastPath,
} from "./fastPaths";
import {
  persistFinishedMessages,
  replaceLastAssistantMessageWithText,
  sanitizeConversationTitle,
  withChatHeaders,
} from "./persistence";
import {
  createToolPartFromStreamState,
  isRecoverableToolOnlyStreamError,
  pipeModelFullStreamToUIMessageStream,
  pipeUIMessageStream,
  uiChunkHasToolActivity,
  uiChunkHasVisibleText,
  writeAssistantTextMessage,
} from "./streaming";
import {
  assistantMessageHasTextAfterToolActivity,
  assistantMessageHasToolActivity,
  createResponseMessageId,
  extractUiMessageText,
  findLatestAssistantMessage,
  resolveChatId,
  serializeForLog,
  serializeForToolCache,
  toRuntimeChatErrorMessage,
  trimOrUndefinedValue,
} from "./utils";

export interface RuntimeChatService {
  listToolNames: (lane?: GatewayLane) => string[];
  stream: (
    messages: UIMessage[],
    input?: {
      headers?: HeadersInit;
      chatId?: string;
      sessionId?: string;
      conversationTitle?: string;
      lane?: GatewayLane;
      abortSignal?: AbortSignal;
    },
  ) => Promise<Response>;
}

export interface RuntimeChatServiceDeps {
  dispatcher: ActionDispatcher;
  registry: ActionRegistry;
  eventBus: RuntimeEventBus;
  stateStore: StateStore;
  rpcUrl?: string;
  jupiter?: unknown;
  jupiterTrigger?: unknown;
  jupiterUltra?: unknown;
  tokenAccounts?: unknown;
  ultraSigner?: {
    address?: string;
    signBase64Transaction: (base64Transaction: string) => Promise<string>;
  };
  enqueueJob?: (input: RuntimeJobEnqueueRequest) => Promise<import("../../ai").JobState>;
  manageJob?: (input: RuntimeJobControlRequest) => Promise<import("../../ai").JobState>;
  logger?: RuntimeLogger;
  toolSnapshot?: RuntimeToolSnapshot;
  workspaceRootDirectory?: string;
  gateway: RuntimeGateway;
}

export interface RuntimeChatServiceOverrides {
  convertToModelMessages?: typeof convertToModelMessagesFn;
  streamText?: typeof streamTextFn;
  generateText?: typeof generateTextFn;
}

const CHAT_MODEL_STREAM_TIMEOUT = {
  totalMs: 900_000,
  stepMs: 600_000,
  chunkMs: 300_000,
} as const;

const CHAT_MODEL_FALLBACK_GENERATE_TIMEOUT = {
  totalMs: 300_000,
  stepMs: 300_000,
} as const;

const resolveWorkspaceRootDirectory = (workspaceRootDirectory?: string): string =>
  workspaceRootDirectory ?? resolveDefaultWorkspaceBashRoot();

const isOpenRouterFreeModel = (provider: string | null | undefined, modelId: string | null | undefined): boolean =>
  provider === "openrouter" && typeof modelId === "string" && (modelId === "openrouter/free" || modelId.endsWith(":free"));

const buildActionTools = (
  deps: RuntimeChatServiceDeps,
  enabledToolNames?: ReadonlySet<string> | null,
  input?: {
    onToolResult?: (result: {
      actionName: string;
      rawInput: unknown;
      output: Record<string, unknown>;
    }) => void;
  },
): Record<string, any> => {
  const tools: Record<string, any> = {};
  const toolResultCache = new Map<string, Promise<Record<string, unknown>>>();
  const { toolSnapshot } = deps;

  for (const registered of deps.registry.list()) {
    const action = deps.registry.get(registered.name);
    if (!action || !action.inputSchema) {
      continue;
    }
    if (enabledToolNames && !enabledToolNames.has(action.name)) {
      continue;
    }

    const toolEntry = toolSnapshot?.actions.find((entry) => entry.name === action.name);
    const modelInputSchema = getModelToolEnvelopeSchema(action.name, action.inputSchema as z.ZodTypeAny);
    tools[action.name] = tool({
      description:
        toolEntry?.toolDescription
        ?? `Dispatch runtime action "${action.name}" (${action.category}${action.subcategory ? `/${action.subcategory}` : ""}).`,
      inputSchema: modelInputSchema as z.ZodTypeAny,
      ...(toolEntry?.exampleInput === undefined ? {} : { inputExamples: [{ input: toolEntry.exampleInput }] }),
      execute: async (rawEnvelope: unknown) => {
        const rawInput = normalizeModelToolEnvelopeInput(action.name, rawEnvelope);
        const cacheKey = `${action.name}:${serializeForToolCache(rawInput)}`;
        const cachedResult = toolResultCache.get(cacheKey);
        if (cachedResult) {
          deps.logger?.info("chat:tool_cache_hit", {
            actionName: action.name,
            input: serializeForLog(rawInput),
          });
          return await cachedResult;
        }

        const dispatchStartedAt = Date.now();
        const executionPromise = (async (): Promise<Record<string, unknown>> => {
          deps.logger?.info("chat:tool_start", {
            actionName: action.name,
            input: serializeForLog(rawInput),
          });

          const dispatchResult = await deps.dispatcher.dispatchStep(
            createActionContext({
              actor: "agent",
              eventBus: deps.eventBus,
              rpcUrl: deps.rpcUrl,
              jupiter: deps.jupiter,
              jupiterTrigger: deps.jupiterTrigger,
              jupiterUltra: deps.jupiterUltra,
              tokenAccounts: deps.tokenAccounts,
              ultraSigner: deps.ultraSigner,
              stateStore: deps.stateStore,
              enqueueJob: deps.enqueueJob,
              manageJob: deps.manageJob,
            }),
            {
              actionName: action.name,
              input: rawInput,
            },
          );

          const result = dispatchResult.results[0];
          if (!result) {
            deps.logger?.error("chat:tool_fail", {
              actionName: action.name,
              durationMs: Date.now() - dispatchStartedAt,
              error: `Action "${action.name}" returned no dispatcher result`,
              policyHits: serializeForLog(dispatchResult.policyHits),
            });
            return {
              ok: false,
              error: `Action "${action.name}" returned no dispatcher result`,
              retryable: false,
              policyHits: dispatchResult.policyHits,
            };
          }

          if (!result.ok) {
            deps.logger?.error("chat:tool_fail", {
              actionName: action.name,
              idempotencyKey: result.idempotencyKey,
              durationMs: Date.now() - dispatchStartedAt,
              actionDurationMs: result.durationMs,
              retryable: result.retryable,
              error: result.error ?? "unknown error",
              payload: serializeForLog(result.data ?? null),
              policyHits: serializeForLog(dispatchResult.policyHits),
            });
          } else {
            deps.logger?.info("chat:tool_success", {
              actionName: action.name,
              idempotencyKey: result.idempotencyKey,
              durationMs: Date.now() - dispatchStartedAt,
              actionDurationMs: result.durationMs,
              txSignature: result.txSignature ?? null,
            });
          }

          const output = {
            ok: result.ok,
            error: result.error ?? null,
            retryable: result.retryable,
            txSignature: result.txSignature ?? null,
            idempotencyKey: result.idempotencyKey,
            data: result.data ?? null,
            policyHits: dispatchResult.policyHits,
          };
          input?.onToolResult?.({
            actionName: action.name,
            rawInput,
            output,
          });
          return output;
        })();

        toolResultCache.set(
          cacheKey,
          executionPromise.catch((error) => {
            toolResultCache.delete(cacheKey);
            throw error;
          }),
        );
        return await toolResultCache.get(cacheKey)!;
      },
    });
  }

  return tools;
};

const normalizeToolNameForPromptMatch = (toolName: string): string =>
  toolName
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .toLowerCase();

const resolveRequestedToolChoice = (
  userMessage: string,
  toolNames: string[],
): "required" | { type: "tool"; toolName: string } | undefined => {
  const normalizedUserMessage = userMessage.trim().toLowerCase();
  if (!normalizedUserMessage) {
    return undefined;
  }

  const explicitlyNamedTools = toolNames.filter((toolName) => {
    const normalizedToolName = toolName.toLowerCase();
    return normalizedUserMessage.includes(normalizedToolName)
      || normalizedUserMessage.includes(normalizeToolNameForPromptMatch(toolName));
  });

  if (explicitlyNamedTools.length === 1) {
    return { type: "tool", toolName: explicitlyNamedTools[0]! };
  }

  if (explicitlyNamedTools.length > 1) {
    return "required";
  }

  const asksForShell =
    toolNames.includes("workspaceBash")
    && /(bash tool|shell command|use bash|use shell|run bash|run shell|run pwd|run ls|run rg)/iu.test(normalizedUserMessage);
  const asksForKnowledge =
    (toolNames.includes("listKnowledgeDocs") || toolNames.includes("readKnowledgeDoc"))
    && /(knowledge docs?|read (its|your|the) own knowledge|read .*knowledge|pull up .*knowledge|retrieve .*knowledge)/iu.test(normalizedUserMessage);

  if (asksForShell || asksForKnowledge) {
    return "required";
  }

  return undefined;
};

const createForcedFirstStepToolConfig = (
  toolChoice: "required" | { type: "tool"; toolName: string } | undefined,
  input?: {
    provider?: string | null;
    modelId?: string | null;
  },
): ((input: { stepNumber: number }) => {
  toolChoice?: "auto" | "required" | { type: "tool"; toolName: string };
  activeTools?: string[];
}) | undefined => {
  if (!toolChoice) {
    return undefined;
  }

  if (input?.provider === "openrouter") {
    if (toolChoice === "required") {
      return undefined;
    }

    return ({ stepNumber }) => {
      if (stepNumber <= 1) {
        return { activeTools: [toolChoice.toolName] };
      }

      return {};
    };
  }

  return ({ stepNumber }) => {
    if (stepNumber <= 1) {
      return toolChoice === "required"
        ? { toolChoice }
        : { toolChoice, activeTools: [toolChoice.toolName] };
    }

    return { toolChoice: "auto" };
  };
};

const renderConversationHistoryPromptSection = (input: {
  chatId: string;
  loadedMessageCount: number;
  estimatedTokenCount: number;
  nextBeforeMessageId?: string;
  preloadTokenBudget: number;
  continuationTokenBudget: number;
}): string => {
  const lines = [
    "## Conversation memory",
    `- **Preload**: up to ${input.loadedMessageCount} prior persisted messages (~${input.estimatedTokenCount} est. tokens after tags) included by walking **newest → oldest** until the ~${input.preloadTokenBudget}-token budget, then shown **oldest → newest** for reading.`,
    "- **Numbering**: each preloaded row starts with `[History #i/N | messageId=… | role=…]`. `i=1` is the **oldest** message in this window; `i=N` is the newest persisted message before the live tail. Messages **without** that prefix are the current request thread.",
    "- **Older rows**: `getConversationHistorySlice` returns the next chunk **strictly before** `beforeMessageId`. Pass the `messageId` from `[History #1/…]` to continue backward when more history exists.",
  ];

  if (input.nextBeforeMessageId) {
    lines.push(
      `- **More history available** before \`${input.nextBeforeMessageId}\`. Example: \`queryRuntimeStore\` → \`{"request":{"type":"getConversationHistorySlice","conversationId":"${input.chatId}","beforeMessageId":"${input.nextBeforeMessageId}","tokenBudget":${input.continuationTokenBudget},"limit":${DEFAULT_CONVERSATION_HISTORY_SLICE_LIMIT}}}\` (raise \`tokenBudget\` up to runtime max for wider slices).`,
    );
  } else {
    lines.push("- **Coverage**: all persisted same-conversation messages that fit the preload budget are already in the thread; no older rows remain, or the store has no further history for this chat.");
  }

  return lines.join("\n");
};

export const createRuntimeChatService = (
  deps: RuntimeChatServiceDeps,
  overrides: RuntimeChatServiceOverrides = {},
): RuntimeChatService => {
  const convertMessages = overrides.convertToModelMessages ?? convertToModelMessages;
  const streamWithModel = overrides.streamText ?? streamText;
  const generateWithModel = overrides.generateText ?? generateText;
  const workspaceToolPromises = new Map<string, Promise<Record<string, unknown>>>();

  const listToolNames = (lane: GatewayLane = "operator-chat"): string[] => deps.gateway.listToolNames(lane);

  const stream = async (
    messages: UIMessage[],
    input?: {
      headers?: HeadersInit;
      chatId?: string;
      sessionId?: string;
      conversationTitle?: string;
      lane?: GatewayLane;
      abortSignal?: AbortSignal;
    },
  ): Promise<Response> => {
    const streamStartedAt = Date.now();
    const chatId = resolveChatId(input?.chatId);
    deps.logger?.info("chat:stream_start", {
      chatId,
      inputMessageCount: messages.length,
      sessionId: trimOrUndefinedValue(input?.sessionId) ?? null,
    });
    const now = Date.now();
    const existingConversation = deps.stateStore.getConversation(chatId);
    deps.stateStore.saveConversation({
      id: chatId,
      sessionId: trimOrUndefinedValue(input?.sessionId) ?? existingConversation?.sessionId,
      title: sanitizeConversationTitle(input?.conversationTitle, messages) ?? existingConversation?.title,
      summary: existingConversation?.summary,
      createdAt: existingConversation?.createdAt ?? now,
      updatedAt: now,
    });

    try {
      const latestUserMessage = extractUiMessageText(messages.at(-1) ?? {
        id: "",
        role: "user",
        parts: [] as UIMessage["parts"],
      } as UIMessage);

      if (shouldUseWalletInventoryFastPath(latestUserMessage)) {
        const fastPathStartedAt = Date.now();
        const fastPathInput = {
          includeZeroBalances: false,
        } satisfies Record<string, unknown>;
        deps.logger?.info("chat:fast_path_start", {
          chatId,
          route: "wallet-inventory",
        });

        const dispatchResult = await deps.dispatcher.dispatchStep(
          createActionContext({
            actor: "agent",
            eventBus: deps.eventBus,
            rpcUrl: deps.rpcUrl,
              jupiter: deps.jupiter,
            jupiterTrigger: deps.jupiterTrigger,
            jupiterUltra: deps.jupiterUltra,
            tokenAccounts: deps.tokenAccounts,
            ultraSigner: deps.ultraSigner,
            stateStore: deps.stateStore,
            enqueueJob: deps.enqueueJob,
            manageJob: deps.manageJob,
          }),
          {
            actionName: "getWalletContents",
            input: fastPathInput,
          },
        );
        const directResult = dispatchResult.results[0];
        if (directResult?.ok && directResult.data) {
          const responseText = formatWalletInventoryFastPathText(directResult.data);
          if (responseText) {
            deps.logger?.info("chat:fast_path_hit", {
              chatId,
              route: "wallet-inventory",
              durationMs: Date.now() - fastPathStartedAt,
            });
            return createDirectToolResultStreamResponse({
              headers: input?.headers,
              chatId,
              originalMessages: messages,
              toolName: "getWalletContents",
              toolInput: fastPathInput,
              toolOutput: directResult.data,
              text: responseText,
              onFinish: (finalMessages) => {
                persistFinishedMessages(deps, chatId, {
                  sessionId: input?.sessionId,
                  conversationTitle: input?.conversationTitle,
                }, finalMessages);
                deps.logger?.info("chat:stream_finish", {
                  chatId,
                  durationMs: Date.now() - streamStartedAt,
                  finalMessageCount: finalMessages.length,
                  route: "wallet-inventory-fast-path",
                });
              },
            });
          }
        }
      }

      if (shouldUseWalletContentsFastPath(latestUserMessage)) {
        const fastPathStartedAt = Date.now();
        const fastPathInput = {
          includeZeroBalances: false,
        } satisfies Record<string, unknown>;
        deps.logger?.info("chat:fast_path_start", {
          chatId,
          route: "wallet-contents",
        });

        const dispatchResult = await deps.dispatcher.dispatchStep(
          createActionContext({
            actor: "agent",
            eventBus: deps.eventBus,
            rpcUrl: deps.rpcUrl,
            jupiter: deps.jupiter,
            jupiterTrigger: deps.jupiterTrigger,
            jupiterUltra: deps.jupiterUltra,
            tokenAccounts: deps.tokenAccounts,
            ultraSigner: deps.ultraSigner,
            stateStore: deps.stateStore,
            enqueueJob: deps.enqueueJob,
            manageJob: deps.manageJob,
          }),
          {
            actionName: "getWalletContents",
            input: fastPathInput,
          },
        );
        const directResult = dispatchResult.results[0];
        const directText =
          directResult?.ok && directResult.data
            ? formatWalletContentsFastPathText(directResult.data)
            : directResult?.error
              ? formatWalletContentsRateLimitText("getWalletContents", directResult.error)
                ?? `I couldn't load wallet contents: ${directResult.error}`
              : null;
        if (directResult && directText) {
          deps.logger?.info("chat:fast_path_hit", {
            chatId,
            route: "wallet-contents",
            durationMs: Date.now() - fastPathStartedAt,
            ok: directResult.ok,
          });
          return createDirectToolResultStreamResponse({
            headers: input?.headers,
            chatId,
            originalMessages: messages,
            toolName: "getWalletContents",
            toolInput: fastPathInput,
            toolOutput: directResult.ok
              ? directResult.data
              : {
                  ok: false,
                  error: directResult.error ?? "Unknown error",
                  retryable: directResult.retryable,
                },
            text: directText,
            onFinish: (finalMessages) => {
              persistFinishedMessages(deps, chatId, {
                sessionId: input?.sessionId,
                conversationTitle: input?.conversationTitle,
              }, finalMessages);
              deps.logger?.info("chat:stream_finish", {
                chatId,
                durationMs: Date.now() - streamStartedAt,
                finalMessageCount: finalMessages.length,
                route: "wallet-contents-fast-path",
              });
            },
          });
        }
      }

      const prepareModelInputStartedAt = Date.now();
      const preparedExecution = await deps.gateway.prepareChatExecution({
        lane: input?.lane ?? "operator-chat",
        messages,
        userMessage: latestUserMessage,
        sessionId: input?.sessionId,
        abortSignal: input?.abortSignal,
      });
      if (preparedExecution.kind === "direct") {
        deps.logger?.info("chat:direct_response", {
          chatId,
          lane: preparedExecution.lane,
          toolCalls: preparedExecution.response.toolCalls.join(",") || "none",
          durationMs: Date.now() - streamStartedAt,
        });
        return createDirectTextStreamResponse({
          text: preparedExecution.response.message,
          headers: input?.headers,
          chatId,
          originalMessages: messages,
          onFinish: (finalMessages) => {
            persistFinishedMessages(deps, chatId, {
              sessionId: input?.sessionId,
              conversationTitle: input?.conversationTitle,
            }, finalMessages);
            deps.logger?.info("chat:stream_finish", {
              chatId,
              durationMs: Date.now() - streamStartedAt,
              finalMessageCount: finalMessages.length,
            });
          },
        });
      }

      const model = preparedExecution.model;
      let systemPrompt = preparedExecution.systemPrompt;
      const enabledToolNames = new Set(preparedExecution.toolNames);
      const maxOutputTokens = preparedExecution.maxOutputTokens;
      const temperature = preparedExecution.temperature;
      const maxToolSteps = preparedExecution.maxToolSteps;
      const provider = preparedExecution.provider;
      const modelId = preparedExecution.modelId;
      const toolChoice = resolveRequestedToolChoice(latestUserMessage, preparedExecution.toolNames);
      const prepareStep = createForcedFirstStepToolConfig(toolChoice, {
        provider,
        modelId,
      });
      const isSelectedFreeOpenRouterModel = isOpenRouterFreeModel(provider, modelId);

      if (toolChoice === "required" && !prepareStep && provider === "openrouter") {
        deps.logger?.info("chat:tool_choice_downgraded", {
          chatId,
          provider,
          model: modelId,
          reason: "openrouter_required_tool_choice_unsupported",
        });
      }

      deps.logger?.info("chat:model_ready", {
        chatId,
        provider,
        model: modelId,
      });

      const executedToolResults = new Map<string, {
        actionName: string;
        rawInput: unknown;
        output: Record<string, unknown>;
      }>();
      const tools: Record<string, any> = buildActionTools(deps, enabledToolNames, {
        onToolResult: (result) => {
          const cacheKey = `${result.actionName}:${serializeForToolCache(result.rawInput)}`;
          executedToolResults.set(cacheKey, result);
        },
      });
      const needsWorkspaceTools = preparedExecution.toolNames.some((toolName) =>
        WORKSPACE_TOOL_NAMES.includes(toolName as (typeof WORKSPACE_TOOL_NAMES)[number]),
      );
      if (needsWorkspaceTools) {
        const workspaceToolsStartedAt = Date.now();
        const workspaceRootDirectory = resolveWorkspaceRootDirectory(deps.workspaceRootDirectory);
        const workspaceToolMetadataByName = Object.fromEntries(
          (deps.toolSnapshot?.workspaceTools ?? []).map((toolEntry) => [
            toolEntry.name,
            {
              description: toolEntry.toolDescription,
              ...(toolEntry.exampleInput === undefined ? {} : { inputExamples: [{ input: toolEntry.exampleInput }] }),
            },
          ]),
        );
        const workspaceToolPromise =
          workspaceToolPromises.get(workspaceRootDirectory) ??
          createWorkspaceBashTools({
            workspaceRootDirectory,
            actor: "agent",
            toolMetadataByName: workspaceToolMetadataByName,
          });
        workspaceToolPromises.set(workspaceRootDirectory, workspaceToolPromise);
        const loadedWorkspaceTools = await workspaceToolPromise;
        for (const [toolName, workspaceTool] of Object.entries(loadedWorkspaceTools)) {
          if (enabledToolNames && !enabledToolNames.has(toolName)) {
            continue;
          }
          tools[toolName] = workspaceTool;
        }
        deps.logger?.info("chat:workspace_tools_ready", {
          chatId,
          durationMs: Date.now() - workspaceToolsStartedAt,
          workspaceRootDirectory,
        });
      }

      const historyCandidateSlice = deps.stateStore.getConversationHistorySlice({
        conversationId: chatId,
        limit: 500,
        tokenBudget: DEFAULT_CONVERSATION_HISTORY_TOKEN_BUDGET * 3,
      });
      const nonOverlappingHistoryCandidates = excludeCurrentConversationOverlap({
        historyMessages: historyCandidateSlice.messages,
        currentMessages: messages,
      });
      const selectedConversationHistory = selectConversationHistoryMessages({
        messages: nonOverlappingHistoryCandidates,
        limit: nonOverlappingHistoryCandidates.length,
        tokenBudget: DEFAULT_CONVERSATION_HISTORY_TOKEN_BUDGET,
      });
      const historyMessages = tagHistoryUiMessagesForModelContext(
        selectedConversationHistory.messages
          .map((message) => replayChatMessageState(message))
          .filter((message) => isReplayableUiMessage(message)),
      );
      const olderHistoryAvailable =
        historyCandidateSlice.hasMoreBefore
        || nonOverlappingHistoryCandidates.length > selectedConversationHistory.messages.length;
      const nextBeforeMessageId =
        olderHistoryAvailable
          ? (
              selectedConversationHistory.messages[0]?.id
              ?? nonOverlappingHistoryCandidates[0]?.id
              ?? historyCandidateSlice.nextBeforeMessageId
            )
          : undefined;
      systemPrompt = [
        systemPrompt,
        renderConversationHistoryPromptSection({
          chatId,
          loadedMessageCount: historyMessages.length,
          estimatedTokenCount: selectedConversationHistory.estimatedTokenCount,
          nextBeforeMessageId,
          preloadTokenBudget: DEFAULT_CONVERSATION_HISTORY_TOKEN_BUDGET,
          continuationTokenBudget: DEFAULT_CONVERSATION_HISTORY_SLICE_TOKEN_BUDGET,
        }),
      ]
        .filter((section) => section.trim().length > 0)
        .join("\n\n");

      const validatedMessages =
        historyMessages.length + messages.length === 0
          ? []
          : await validateUIMessages({
              messages: [...historyMessages, ...messages],
              tools,
            });
      const modelMessages = await convertMessages(validatedMessages, {
        tools,
        ignoreIncompleteToolCalls: true,
      });
      deps.logger?.info("chat:model_input_ready", {
        chatId,
        durationMs: Date.now() - prepareModelInputStartedAt,
        validatedMessageCount: validatedMessages.length,
        toolCount: Object.keys(tools).length,
        historyMessageCount: historyMessages.length,
        historyTokenEstimate: selectedConversationHistory.estimatedTokenCount,
        olderHistoryAvailable,
        systemPromptChars: systemPrompt.length,
      });

      const streamBuildStartedAt = Date.now();
      deps.logger?.info("chat:model_stream_initialized", {
        chatId,
        durationMs: Date.now() - streamBuildStartedAt,
        maxOutputTokens,
        temperature: temperature ?? null,
        lane: preparedExecution.lane,
        provider,
        model: modelId,
      });

      const buildStreamArgs = (inputMessages: Awaited<ReturnType<typeof convertMessages>>, enabledTools?: Record<string, any>) => ({
        model,
        system: systemPrompt,
        messages: inputMessages,
        abortSignal: input?.abortSignal,
        timeout: CHAT_MODEL_STREAM_TIMEOUT,
        ...(typeof maxOutputTokens === "number" ? { maxOutputTokens } : {}),
        ...(typeof temperature === "number" ? { temperature } : {}),
        ...(typeof maxToolSteps === "number" && enabledTools ? { stopWhen: stepCountIs(maxToolSteps) } : {}),
        ...(prepareStep && enabledTools ? { prepareStep } : {}),
        ...(enabledTools ? { tools: enabledTools } : {}),
      });

      const firstResult = streamWithModel(buildStreamArgs(modelMessages, tools));
      const supportsMergedStreaming =
        typeof firstResult === "object"
        && firstResult !== null
        && "toUIMessageStream" in firstResult
        && typeof firstResult.toUIMessageStream === "function"
        && "consumeStream" in firstResult
        && typeof firstResult.consumeStream === "function";

      let finalAssistantTextOverride: string | null = null;
      const response = supportsMergedStreaming
        ? createUIMessageStreamResponse({
            headers: withChatHeaders(input?.headers, chatId),
            stream: createUIMessageStream({
              originalMessages: validatedMessages,
              execute: async ({ writer }) => {
                let firstPassMessages: UIMessage[] = validatedMessages;
                let firstResponseMessage: UIMessage | undefined;
                let streamSawToolActivity = false;
                let firstPassSawTextAfterToolActivity = false;
                const bufferedTerminalProblemChunks: UIMessageChunk[] = [];
                const observedToolCalls = new Map<string, {
                  toolName: string;
                  input?: unknown;
                  output?: unknown;
                }>();

                const handleFirstPassChunk = (chunk: UIMessageChunk): void => {
                  if (
                    isSelectedFreeOpenRouterModel
                    && (chunk.type === "error" || chunk.type === "abort")
                  ) {
                    bufferedTerminalProblemChunks.push(chunk);
                    return;
                  }
                  writer.write(chunk);
                };
                const observeFirstPassChunk = (chunk: UIMessageChunk): void => {
                  if (uiChunkHasToolActivity(chunk)) {
                    streamSawToolActivity = true;
                  }
                  if (
                    chunk.type === "tool-input-available"
                    && typeof chunk.toolCallId === "string"
                    && typeof chunk.toolName === "string"
                  ) {
                    const current = observedToolCalls.get(chunk.toolCallId);
                    observedToolCalls.set(chunk.toolCallId, {
                      toolName: chunk.toolName,
                      input: chunk.input,
                      output: current?.output,
                    });
                  }
                  if (chunk.type === "tool-output-available" && typeof chunk.toolCallId === "string") {
                    const current = observedToolCalls.get(chunk.toolCallId);
                    if (current?.toolName) {
                      observedToolCalls.set(chunk.toolCallId, {
                        ...current,
                        output: chunk.output,
                      });
                    }
                  }
                  if (uiChunkHasVisibleText(chunk) && streamSawToolActivity) {
                    firstPassSawTextAfterToolActivity = true;
                  }
                };
                const hasFullStream =
                  typeof firstResult === "object"
                  && firstResult !== null
                  && "fullStream" in firstResult
                  && firstResult.fullStream
                  && typeof (firstResult.fullStream as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function";
                const pipePromise = hasFullStream
                  ? pipeModelFullStreamToUIMessageStream(
                      firstResult.fullStream as AsyncIterable<Record<string, unknown>>,
                      handleFirstPassChunk,
                      observeFirstPassChunk,
                    )
                  : pipeUIMessageStream(
                      firstResult.toUIMessageStream({
                        originalMessages: validatedMessages,
                        sendReasoning: true,
                        onError: (error) => toRuntimeChatErrorMessage(error),
                        onFinish: ({ messages: completedMessages, responseMessage }) => {
                          firstPassMessages = completedMessages;
                          firstResponseMessage = responseMessage;
                        },
                      }),
                      handleFirstPassChunk,
                      observeFirstPassChunk,
                    );
                const consumePromise = hasFullStream ? Promise.resolve() : firstResult.consumeStream();
                const [consumeResult, pipeResult] = await Promise.allSettled([
                  consumePromise,
                  pipePromise,
                ]);
                if (consumeResult.status === "rejected") {
                  throw consumeResult.reason;
                }
                if (pipeResult.status === "rejected") {
                  if (!(streamSawToolActivity && isRecoverableToolOnlyStreamError(pipeResult.reason))) {
                    throw pipeResult.reason;
                  }
                }
                const observedToolParts = Array.from(observedToolCalls.entries()).flatMap(([toolCallId, entry]) => {
                  const parts: UIMessage["parts"] = [];
                  if (entry.input !== undefined) {
                    parts.push(createToolPartFromStreamState({
                      toolName: entry.toolName,
                      toolCallId,
                      state: "input-available",
                      input: entry.input,
                    }));
                  }
                  if (entry.output !== undefined) {
                    parts.push(createToolPartFromStreamState({
                      toolName: entry.toolName,
                      toolCallId,
                      state: "output-available",
                      input: entry.input ?? null,
                      output: entry.output,
                    }));
                  }
                  return parts;
                });
                const observedToolMessage =
                  observedToolParts.length > 0
                    ? {
                        id: createChatMessageId(),
                        role: "assistant" as const,
                        parts: observedToolParts,
                      }
                    : undefined;
                const executedToolParts = Array.from(executedToolResults.values()).map((result) =>
                  createToolPartFromStreamState({
                    toolName: result.actionName,
                    toolCallId: createToolCallId(),
                    state: "output-available",
                    input: result.rawInput ?? null,
                    output: result.output,
                  }));
                const executedToolMessage =
                  executedToolParts.length > 0
                    ? {
                        id: createChatMessageId(),
                        role: "assistant" as const,
                        parts: executedToolParts,
                      }
                    : undefined;
                const recoveredFirstPassMessages =
                  firstPassMessages.length > validatedMessages.length
                    ? firstPassMessages
                    : [
                        ...validatedMessages,
                        ...(observedToolMessage ? [observedToolMessage] : []),
                        ...(executedToolMessage ? [executedToolMessage] : []),
                      ];
                const completedAssistantMessage = firstResponseMessage ?? findLatestAssistantMessage(recoveredFirstPassMessages);
                const completedAssistantHasToolActivity = assistantMessageHasToolActivity(completedAssistantMessage);
                const completedAssistantHasTextAfterToolActivity = assistantMessageHasTextAfterToolActivity(completedAssistantMessage);
                const firstPassHadToolActivity = streamSawToolActivity || completedAssistantHasToolActivity;

                const flushBufferedTerminalProblemChunks = (): void => {
                  for (const chunk of bufferedTerminalProblemChunks) {
                    writer.write(chunk);
                  }
                  bufferedTerminalProblemChunks.length = 0;
                };

                if (!firstPassHadToolActivity) {
                  if (bufferedTerminalProblemChunks.length > 0) {
                    flushBufferedTerminalProblemChunks();
                  }
                  return;
                }

                if (
                  firstPassSawTextAfterToolActivity
                  || completedAssistantHasTextAfterToolActivity
                ) {
                  if (bufferedTerminalProblemChunks.length > 0) {
                    flushBufferedTerminalProblemChunks();
                  }
                  return;
                }

                const deterministicToolOnlyText = formatKnownToolOnlyCompletionText(completedAssistantMessage)
                  ?? formatKnownToolOnlyCompletionText(observedToolMessage)
                  ?? formatKnownToolOnlyCompletionText(executedToolMessage);
                if (deterministicToolOnlyText) {
                  if (bufferedTerminalProblemChunks.length > 0) {
                    flushBufferedTerminalProblemChunks();
                  }
                  finalAssistantTextOverride = deterministicToolOnlyText;
                  deps.logger?.info("chat:tool_only_completion_resolved", {
                    chatId,
                    lane: preparedExecution.lane,
                    provider,
                    model: modelId,
                  });
                  writeAssistantTextMessage({
                    writeChunk: (chunk) => writer.write(chunk),
                    text: deterministicToolOnlyText,
                    finishReason: "stop",
                  });
                  return;
                }

                if (bufferedTerminalProblemChunks.length > 0) {
                  flushBufferedTerminalProblemChunks();
                }

                deps.logger?.warn("chat:tool_only_completion", {
                  chatId,
                  lane: preparedExecution.lane,
                  provider,
                  model: modelId,
                });

                const followUpMessages = await convertMessages(
                  [
                    ...recoveredFirstPassMessages,
                    {
                      id: createChatMessageId(),
                      role: "user",
                      parts: [
                        {
                          type: "text",
                          text: "Answer the user directly using the tool results already gathered. Do not call tools again.",
                        },
                      ],
                    },
                  ],
                  {
                    tools,
                    ignoreIncompleteToolCalls: true,
                  },
                );

                const secondResult = await generateWithModel({
                  model,
                  system: systemPrompt,
                  messages: followUpMessages,
                  abortSignal: input?.abortSignal,
                  timeout: CHAT_MODEL_FALLBACK_GENERATE_TIMEOUT,
                  ...(typeof maxOutputTokens === "number" ? { maxOutputTokens } : {}),
                  ...(typeof temperature === "number" ? { temperature } : {}),
                });
                const secondPassText =
                  typeof secondResult?.text === "string" && secondResult.text.trim().length > 0
                    ? secondResult.text.trim()
                    : "I gathered the tool results, but I do not have a usable final summary yet. Ask again with a narrower token or pair scope.";

                writeAssistantTextMessage({
                  writeChunk: (chunk) => writer.write(chunk),
                  text: secondPassText,
                  finishReason: "stop",
                });
              },
              onFinish: async ({ messages: finalMessages }) => {
                const persistableFinalMessages =
                  finalAssistantTextOverride && finalAssistantTextOverride.trim().length > 0
                    ? replaceLastAssistantMessageWithText(finalMessages, finalAssistantTextOverride)
                    : finalMessages;
                persistFinishedMessages(deps, chatId, {
                  sessionId: input?.sessionId,
                  conversationTitle: input?.conversationTitle,
                }, persistableFinalMessages);
                deps.logger?.info("chat:stream_finish", {
                  chatId,
                  durationMs: Date.now() - streamStartedAt,
                  finalMessageCount: finalMessages.length,
                  lane: preparedExecution.lane,
                  provider,
                  model: modelId,
                });
              },
            }),
            consumeSseStream: consumeStream,
          })
        : firstResult.toUIMessageStreamResponse({
            headers: withChatHeaders(input?.headers, chatId),
            originalMessages: validatedMessages,
            generateMessageId: createResponseMessageId,
            consumeSseStream: consumeStream,
            onError: (error) => toRuntimeChatErrorMessage(error),
            onFinish: ({ messages: finalMessages }) => {
              persistFinishedMessages(deps, chatId, {
                sessionId: input?.sessionId,
                conversationTitle: input?.conversationTitle,
              }, finalMessages);
              deps.logger?.info("chat:stream_finish", {
                chatId,
                durationMs: Date.now() - streamStartedAt,
                finalMessageCount: finalMessages.length,
                lane: preparedExecution.lane,
                provider,
                model: modelId,
              });
            },
          });

      if (!response.body) {
        return response;
      }

      let firstChunkAt: number | null = null;
      let chunkCount = 0;
      let byteCount = 0;
      const monitoredBody = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform: (chunk, controller) => {
            if (firstChunkAt === null) {
              firstChunkAt = Date.now();
              deps.logger?.info("chat:model_first_chunk", {
                chatId,
                durationMs: firstChunkAt - streamStartedAt,
              });
            }
            chunkCount += 1;
            byteCount += chunk.byteLength;
            controller.enqueue(chunk);
          },
          flush: () => {
            deps.logger?.info("chat:model_stream_closed", {
              chatId,
              durationMs: Date.now() - streamStartedAt,
              chunkCount,
              bytes: byteCount,
            });
          },
        }),
      );

      return new Response(monitoredBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      const errorMessage = toRuntimeChatErrorMessage(error);
      deps.logger?.error("chat:stream_fail", {
        chatId,
        durationMs: Date.now() - streamStartedAt,
        error: errorMessage,
        payload: serializeForLog({
          sessionId: trimOrUndefinedValue(input?.sessionId) ?? null,
          inputMessageCount: messages.length,
          lastMessage: messages.at(-1)?.parts ?? null,
        }),
      });
      throw new Error(errorMessage, { cause: error });
    }
  };

  return {
    listToolNames,
    stream,
  };
};

