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
import { createActionContext } from "../ai/runtime/types/context";
import { createChatMessageId, createToolCallId } from "../ai/runtime/types/ids";
import { createWorkspaceBashTools } from "./workspace-bash";
import {
  CHAT_MODEL_FALLBACK_GENERATE_TIMEOUT,
  CHAT_MODEL_STREAM_TIMEOUT,
  RUNTIME_WORKSPACE_TOOL_NAMES,
  resolveWorkspaceRootDirectory,
  toToolDescription,
} from "./chat/constants";
import {
  createDirectTextStreamResponse,
  createDirectToolResultStreamResponse,
  formatKnownToolOnlyCompletionText,
  formatWalletContentsFastPathText,
  formatWalletContentsRateLimitText,
  formatWalletInventoryFastPathText,
  shouldUseWalletContentsFastPath,
  shouldUseWalletInventoryFastPath,
} from "./chat/fast-paths";
import {
  persistFinishedMessages,
  replaceLastAssistantMessageWithText,
  sanitizeConversationTitle,
  withChatHeaders,
} from "./chat/persistence";
import {
  createToolPartFromStreamState,
  isReasoningChunk,
  isRecoverableToolOnlyStreamError,
  isSuppressiblePreToolChunk,
  pipeModelFullStreamToUIMessageStream,
  pipeUIMessageStream,
  uiChunkHasToolActivity,
  uiChunkHasVisibleText,
  writeAssistantTextMessage,
} from "./chat/streaming";
import type {
  RuntimeChatService,
  RuntimeChatServiceDeps,
  RuntimeChatServiceOverrides,
} from "./chat/types";
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
} from "./chat/utils";
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

export const createRuntimeChatService = (
  deps: RuntimeChatServiceDeps,
  overrides: RuntimeChatServiceOverrides = {},
): RuntimeChatService => {
  const convertMessages = overrides.convertToModelMessages ?? convertToModelMessages;
  const streamWithModel = overrides.streamText ?? streamText;
  const generateWithModel = overrides.generateText ?? generateText;
  const workspaceToolPromises = new Map<string, Promise<Record<string, unknown>>>();

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
            jupiterTrigger: deps.jupiterTrigger,
            jupiterUltra: deps.jupiterUltra,
            tokenAccounts: deps.tokenAccounts,
            ultraSigner: deps.ultraSigner,
            stateStore: deps.stateStore,
            enqueueJob: deps.enqueueJob,
            manageJob: deps.manageJob,
          }),
          {
            actionName: "getManagedWalletContents",
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
              toolName: "getManagedWalletContents",
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
            jupiterTrigger: deps.jupiterTrigger,
            jupiterUltra: deps.jupiterUltra,
            tokenAccounts: deps.tokenAccounts,
            ultraSigner: deps.ultraSigner,
            stateStore: deps.stateStore,
            enqueueJob: deps.enqueueJob,
            manageJob: deps.manageJob,
          }),
          {
            actionName: "getManagedWalletContents",
            input: fastPathInput,
          },
        );
        const directResult = dispatchResult.results[0];
        const directText =
          directResult?.ok && directResult.data
            ? formatWalletContentsFastPathText(directResult.data)
            : directResult?.error
              ? formatWalletContentsRateLimitText("getManagedWalletContents", directResult.error)
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
            toolName: "getManagedWalletContents",
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
        lane: "operator-chat",
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
        RUNTIME_WORKSPACE_TOOL_NAMES.includes(toolName as (typeof RUNTIME_WORKSPACE_TOOL_NAMES)[number]),
      );
      if (needsWorkspaceTools) {
        const workspaceToolsStartedAt = Date.now();
        const workspaceRootDirectory = resolveWorkspaceRootDirectory(deps.workspaceRootDirectory);
        const workspaceToolPromise =
          workspaceToolPromises.get(workspaceRootDirectory) ??
          createWorkspaceBashTools({
            workspaceRootDirectory,
            actor: "agent",
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
                let streamFlushedToolActivity = false;
                let firstPassSawTextAfterToolActivity = false;
                const queuedPreToolChunks: UIMessageChunk[] = [];
                const observedToolCalls = new Map<string, {
                  toolName: string;
                  input?: unknown;
                  output?: unknown;
                }>();
                const flushQueuedPreToolChunks = (mode: "all" | "structural-only"): void => {
                  for (const queuedChunk of queuedPreToolChunks) {
                    if (mode === "structural-only" && isSuppressiblePreToolChunk(queuedChunk)) {
                      continue;
                    }
                    writer.write(queuedChunk);
                  }
                  queuedPreToolChunks.length = 0;
                };

                const handleFirstPassChunk = (chunk: UIMessageChunk): void => {
                  if (isReasoningChunk(chunk)) {
                    return;
                  }
                  if (!streamFlushedToolActivity) {
                    if (uiChunkHasToolActivity(chunk)) {
                      streamFlushedToolActivity = true;
                      flushQueuedPreToolChunks("all");
                    } else {
                      queuedPreToolChunks.push(chunk);
                      return;
                    }
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
                        sendReasoning: false,
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
                if (queuedPreToolChunks.length > 0) {
                  flushQueuedPreToolChunks("all");
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

                if (!firstPassHadToolActivity) {
                  return;
                }

                if (
                  firstPassSawTextAfterToolActivity
                  || completedAssistantHasTextAfterToolActivity
                ) {
                  return;
                }

                const deterministicToolOnlyText = formatKnownToolOnlyCompletionText(completedAssistantMessage)
                  ?? formatKnownToolOnlyCompletionText(observedToolMessage)
                  ?? formatKnownToolOnlyCompletionText(executedToolMessage);
                if (deterministicToolOnlyText) {
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

export type { RuntimeChatService } from "./chat/types";
