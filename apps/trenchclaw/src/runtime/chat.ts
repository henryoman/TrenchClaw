import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { createActionContext } from "../ai/runtime/types/context";
import type {
  ActionDispatcher,
  ActionRegistry,
  RuntimeEventBus,
  StateStore,
} from "../ai";
import type { RuntimeGateway } from "../ai/gateway";
import {
  createWorkspaceBashTools,
  DEFAULT_WORKSPACE_BASH_ROOT,
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
} from "./workspace-bash";
import type { RuntimeCapabilitySnapshot } from "./capabilities";
import type { RuntimeLogger } from "./logging/runtime-logger";
import type { RuntimeJobControlRequest, RuntimeJobEnqueueRequest } from "../ai/runtime/types/context";

export interface RuntimeChatService {
  listToolNames: () => string[];
  stream: (
    messages: UIMessage[],
    input?: { headers?: HeadersInit; chatId?: string; sessionId?: string; conversationTitle?: string; abortSignal?: AbortSignal },
  ) => Promise<Response>;
}

interface RuntimeChatServiceDeps {
  dispatcher: ActionDispatcher;
  registry: ActionRegistry;
  eventBus: RuntimeEventBus;
  stateStore: StateStore;
  rpcUrl?: string;
  jupiterUltra?: unknown;
  jupiterTrigger?: unknown;
  tokenAccounts?: unknown;
  ultraSigner?: {
    address?: string;
    signBase64Transaction: (base64Transaction: string) => Promise<string>;
  };
  enqueueJob?: (input: RuntimeJobEnqueueRequest) => Promise<import("../ai").JobState>;
  manageJob?: (input: RuntimeJobControlRequest) => Promise<import("../ai").JobState>;
  logger?: RuntimeLogger;
  capabilitySnapshot?: RuntimeCapabilitySnapshot;
  workspaceRootDirectory?: string;
  gateway: RuntimeGateway;
}

interface RuntimeChatServiceOverrides {
  convertToModelMessages?: typeof convertToModelMessages;
  streamText?: typeof streamText;
}

const toToolDescription = (actionName: string, category: string, subcategory?: string): string =>
  `Dispatch runtime action "${actionName}" (${category}${subcategory ? `/${subcategory}` : ""}).`;

const DEFAULT_WORKSPACE_ROOT_DIRECTORY = DEFAULT_WORKSPACE_BASH_ROOT;
const DEFAULT_CHAT_ID_PREFIX = "chat";
const RUNTIME_WORKSPACE_TOOL_NAMES = [
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
] as const;

const trimOrUndefinedValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const extractUiMessageText = (message: UIMessage): string => {
  const text = message.parts
    .map((part) => {
      if (part.type === "text") {
        return part.text.trim();
      }
      if (part.type === "reasoning") {
        return part.text.trim();
      }
      if ("errorText" in part && typeof part.errorText === "string") {
        return `Something went wrong: ${part.errorText}`.trim();
      }
      return "";
    })
    .filter((part) => part.length > 0)
    .join("\n");

  if (text.length > 0) {
    return text;
  }

  return "";
};

const createResponseMessageId = (): string => `msg-${crypto.randomUUID()}`;

const filterPersistableMessages = (messages: UIMessage[]): UIMessage[] =>
  messages.filter(
    (message): message is UIMessage & { role: "assistant" | "system" | "user" } =>
      message.role === "assistant" || message.role === "system" || message.role === "user",
  );

const sanitizeConversationTitle = (title: string | undefined, fallbackMessages: UIMessage[]): string | undefined => {
  const explicit = trimOrUndefinedValue(title);
  if (explicit) {
    return explicit.slice(0, 120);
  }

  const firstUserText = fallbackMessages
    .filter((message) => message.role === "user")
    .map((message) => extractUiMessageText(message))
    .find((text) => text.length > 0);
  if (!firstUserText) {
    return undefined;
  }
  return firstUserText.slice(0, 120);
};

const resolveChatId = (chatId: string | undefined): string =>
  trimOrUndefinedValue(chatId) ?? `${DEFAULT_CHAT_ID_PREFIX}-${crypto.randomUUID()}`;

const withChatHeaders = (headers: HeadersInit | undefined, chatId: string): Headers => {
  const merged = new Headers(headers);
  merged.set("x-trenchclaw-chat-id", chatId);
  return merged;
};

const truncateText = (value: string, maxLength = 1_500): string =>
  value.length > maxLength ? `${value.slice(0, maxLength)}…[truncated]` : value;

const serializeForLog = (value: unknown): string => {
  if (typeof value === "string") {
    return truncateText(value);
  }
  try {
    return truncateText(JSON.stringify(value));
  } catch {
    return "[unserializable]";
  }
};

const toRuntimeChatErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("User not found")) {
    return "LLM authentication failed (OpenRouter: User not found). Update llm/openrouter/api-key in Vault secrets.";
  }
  if (message.includes("401")) {
    return `LLM request rejected with authentication error: ${message}`;
  }
  return message;
};

const buildActionTools = (
  deps: RuntimeChatServiceDeps,
  enabledToolNames?: ReadonlySet<string> | null,
): Record<string, any> => {
  const tools: Record<string, any> = {};

  for (const registered of deps.registry.list()) {
    const action = deps.registry.get(registered.name);
    if (!action || !action.inputSchema) {
      continue;
    }
    if (enabledToolNames && !enabledToolNames.has(action.name)) {
      continue;
    }

    const capability = deps.capabilitySnapshot?.actions.find((entry) => entry.name === action.name);
    tools[action.name] = tool({
      description: capability?.toolDescription ?? toToolDescription(action.name, action.category, action.subcategory),
      inputSchema: action.inputSchema as z.ZodTypeAny,
      execute: async (rawInput: unknown) => {
        const dispatchStartedAt = Date.now();
        deps.logger?.info("chat:tool_start", {
          actionName: action.name,
          input: serializeForLog(rawInput),
        });

        const dispatchResult = await deps.dispatcher.dispatchStep(
          createActionContext({
            actor: "agent",
            eventBus: deps.eventBus,
            rpcUrl: deps.rpcUrl,
            jupiterUltra: deps.jupiterUltra,
            jupiterTrigger: deps.jupiterTrigger,
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

        return {
          ok: result.ok,
          error: result.error ?? null,
          retryable: result.retryable,
          txSignature: result.txSignature ?? null,
          idempotencyKey: result.idempotencyKey,
          data: result.data ?? null,
          policyHits: dispatchResult.policyHits,
        };
      },
    });
  }

  return tools;
};

const persistFinishedMessages = (
  deps: RuntimeChatServiceDeps,
  chatId: string,
  input: { sessionId?: string; conversationTitle?: string },
  finalMessages: UIMessage[],
): void => {
  const updatedAt = Date.now();
  const replayableMessages = filterPersistableMessages(finalMessages);
  const conversation = deps.stateStore.getConversation(chatId);
  const existingMessagesById = new Map(
    deps.stateStore.listChatMessages(chatId, 10_000).map((message) => [message.id, message]),
  );
  deps.stateStore.saveConversation({
    id: chatId,
    sessionId: conversation?.sessionId ?? trimOrUndefinedValue(input.sessionId),
    title: conversation?.title ?? sanitizeConversationTitle(input.conversationTitle, replayableMessages),
    summary: conversation?.summary,
    createdAt: conversation?.createdAt ?? updatedAt,
    updatedAt,
  });

  for (const [index, message] of replayableMessages.entries()) {
    const content = extractUiMessageText(message).trim();
    const existingMessage = trimOrUndefinedValue(message.id) ? existingMessagesById.get(message.id) : undefined;

    deps.stateStore.saveChatMessage({
      id: trimOrUndefinedValue(message.id) ?? `msg-${chatId}-${updatedAt + index}-${crypto.randomUUID()}`,
      conversationId: chatId,
      role: message.role,
      content,
      metadata:
        message.metadata && typeof message.metadata === "object"
          ? {
              ...(message.metadata as Record<string, unknown>),
              uiParts: message.parts,
            }
          : {
              uiParts: message.parts,
            },
      createdAt: existingMessage?.createdAt ?? updatedAt + index,
    });
  }
};

const createDirectTextStreamResponse = (input: {
  text: string;
  headers?: HeadersInit;
  chatId: string;
  originalMessages: UIMessage[];
  onFinish: (messages: UIMessage[]) => void;
}): Response => {
  const textId = `text-${crypto.randomUUID()}`;
  const stream = createUIMessageStream({
    originalMessages: input.originalMessages,
    execute: ({ writer }) => {
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: input.text });
      writer.write({ type: "text-end", id: textId });
    },
    onFinish: async ({ messages: finishedMessages }) => {
      input.onFinish(finishedMessages);
    },
  });

  return createUIMessageStreamResponse({
    headers: withChatHeaders(input.headers, input.chatId),
    stream,
    consumeSseStream: consumeStream,
  });
};

export const createRuntimeChatService = (
  deps: RuntimeChatServiceDeps,
  overrides: RuntimeChatServiceOverrides = {},
): RuntimeChatService => {
  const convertMessages = overrides.convertToModelMessages ?? convertToModelMessages;
  const streamWithModel = overrides.streamText ?? streamText;
  const workspaceRootDirectory = deps.workspaceRootDirectory ?? DEFAULT_WORKSPACE_ROOT_DIRECTORY;
  let workspaceToolPromise: Promise<Record<string, unknown>> | null = null;

  const listToolNames = (): string[] => deps.gateway.listToolNames("operator-chat");

  const stream = async (
    messages: UIMessage[],
    input?: { headers?: HeadersInit; chatId?: string; sessionId?: string; conversationTitle?: string; abortSignal?: AbortSignal },
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
      const prepareModelInputStartedAt = Date.now();
      const preparedExecution = await deps.gateway.prepareChatExecution({
        lane: "operator-chat",
        messages,
        userMessage: extractUiMessageText(messages.at(-1) ?? { id: "", role: "user", parts: [] as UIMessage["parts"] } as UIMessage),
        sessionId: input?.sessionId,
        allowFastPath: true,
        abortSignal: input?.abortSignal,
      });
      if (preparedExecution.kind === "direct") {
        deps.logger?.info("chat:fast_path", {
          chatId,
          lane: preparedExecution.lane,
          fastPath: preparedExecution.response.executionTrace.fastPath,
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
              fastPath: preparedExecution.response.executionTrace.fastPath,
            });
          },
        });
      }

      const model = preparedExecution.model;
      const systemPrompt = preparedExecution.systemPrompt;
      const enabledToolNames = new Set(preparedExecution.toolNames);
      const maxOutputTokens = preparedExecution.maxOutputTokens;
      const temperature = preparedExecution.temperature;
      const maxToolSteps = preparedExecution.maxToolSteps;
      const provider = preparedExecution.provider;
      const modelId = preparedExecution.modelId;

      deps.logger?.info("chat:model_ready", {
        chatId,
        provider,
        model: modelId,
      });

      const tools: Record<string, any> = buildActionTools(deps, enabledToolNames);
      const needsWorkspaceTools = preparedExecution.toolNames.some((toolName) =>
        RUNTIME_WORKSPACE_TOOL_NAMES.includes(toolName as (typeof RUNTIME_WORKSPACE_TOOL_NAMES)[number]),
      );
      if (needsWorkspaceTools) {
        const workspaceToolsStartedAt = Date.now();
        workspaceToolPromise ??= createWorkspaceBashTools({
          workspaceRootDirectory,
          actor: "agent",
        });
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
        });
      }

      const validatedMessages =
        messages.length === 0
          ? []
          : await validateUIMessages({
              messages,
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
        systemPromptChars: systemPrompt.length,
      });

      const streamBuildStartedAt = Date.now();
      const result = streamWithModel({
        model,
        system: systemPrompt,
        messages: modelMessages,
        abortSignal: input?.abortSignal,
        maxOutputTokens,
        temperature,
        stopWhen: stepCountIs(maxToolSteps),
        tools,
      });
      deps.logger?.info("chat:model_stream_initialized", {
        chatId,
        durationMs: Date.now() - streamBuildStartedAt,
        maxOutputTokens,
        temperature: temperature ?? null,
        lane: preparedExecution.lane,
        provider,
        model: modelId,
      });

      const response = result.toUIMessageStreamResponse({
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
