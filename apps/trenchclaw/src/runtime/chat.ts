import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  isToolUIPart,
  stepCountIs,
  streamText,
  tool,
  validateUIMessages,
  type UIMessageChunk,
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
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
  resolveDefaultWorkspaceBashRoot,
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
  generateText?: typeof generateText;
}

const toToolDescription = (actionName: string, category: string, subcategory?: string): string =>
  `Dispatch runtime action "${actionName}" (${category}${subcategory ? `/${subcategory}` : ""}).`;

const DEFAULT_CHAT_ID_PREFIX = "chat";
const CHAT_MODEL_STREAM_TIMEOUT = {
  totalMs: 45_000,
  stepMs: 25_000,
  chunkMs: 12_000,
} as const;
const CHAT_MODEL_FALLBACK_GENERATE_TIMEOUT = {
  totalMs: 20_000,
  stepMs: 20_000,
} as const;
const RUNTIME_WORKSPACE_TOOL_NAMES = [
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
] as const;
const resolveWorkspaceRootDirectory = (workspaceRootDirectory?: string): string =>
  workspaceRootDirectory ?? resolveDefaultWorkspaceBashRoot();
const WALLET_MUTATION_INTENT_TOKENS = [
  "transfer",
  "send",
  "move",
  "swap",
  "buy",
  "sell",
  "create",
  "rename",
  "close",
  "delete",
  "remove",
  "fund",
  "airdrop",
  "deposit",
  "withdraw",
  "import",
  "export",
] as const;
const WALLET_INVENTORY_INTENT_PHRASES = [
  "what wallets do we have",
  "which wallets do we have",
  "list wallets",
  "show wallets",
  "wallet addresses",
  "wallet address",
  "wallet names",
  "wallet name",
] as const;
const WALLET_CONTENTS_INTENT_PHRASES = [
  "what do we have",
  "what is in",
  "whats in",
  "what s in",
  "contents",
  "content",
  "hold",
  "holds",
  "holding",
  "holdings",
  "balance",
  "balances",
  "token",
  "tokens",
  "coin",
  "coins",
  "asset",
  "assets",
  "how much",
  "right now",
  "wallet update",
  "wallet status",
] as const;

const trimOrUndefinedValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const normalizeIntentText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const hasAnyIntentPhrase = (haystack: string, phrases: readonly string[]): boolean =>
  phrases.some((phrase) => haystack.includes(phrase));

const hasWalletMutationIntent = (userMessage: string): boolean => {
  const normalized = normalizeIntentText(userMessage);
  return hasAnyIntentPhrase(normalized, WALLET_MUTATION_INTENT_TOKENS);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isToolLikePart = (value: unknown): value is Record<string, unknown> & { type: string } =>
  isRecord(value) && typeof value.type === "string" && value.type.startsWith("tool-");

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

const assistantMessageHasToolActivity = (message: UIMessage | undefined): boolean => {
  if (!message || message.role !== "assistant") {
    return false;
  }
  return message.parts.some((part) => isToolUIPart(part));
};

const assistantMessageHasTextAfterToolActivity = (message: UIMessage | undefined): boolean => {
  if (!message || message.role !== "assistant") {
    return false;
  }
  let sawToolActivity = false;
  for (const part of message.parts) {
    if (isToolUIPart(part)) {
      sawToolActivity = true;
      continue;
    }
    if (sawToolActivity && part.type === "text" && part.text.trim().length > 0) {
      return true;
    }
  }
  return false;
};

const findLatestAssistantMessage = (messages: UIMessage[]): UIMessage | undefined => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message;
    }
  }
  return undefined;
};

const uiChunkHasVisibleText = (chunk: UIMessageChunk): boolean => {
  if (chunk.type === "text-delta") {
    return chunk.delta.trim().length > 0;
  }
  return false;
};

const isSuppressiblePreToolChunk = (chunk: UIMessageChunk): boolean =>
  chunk.type === "text-start"
  || chunk.type === "text-delta"
  || chunk.type === "text-end"
  || chunk.type === "reasoning-start"
  || chunk.type === "reasoning-delta"
  || chunk.type === "reasoning-end";

const isReasoningChunk = (chunk: UIMessageChunk): boolean =>
  chunk.type === "reasoning-start"
  || chunk.type === "reasoning-delta"
  || chunk.type === "reasoning-end";

const uiChunkHasToolActivity = (chunk: UIMessageChunk): boolean =>
  chunk.type === "tool-input-start"
  || chunk.type === "tool-input-delta"
  || chunk.type === "tool-input-available"
  || chunk.type === "tool-input-error"
  || chunk.type === "tool-output-available"
  || chunk.type === "tool-output-error"
  || chunk.type === "tool-output-denied"
  || chunk.type === "tool-approval-request";

const pipeUIMessageStream = async (
  stream: ReadableStream<UIMessageChunk>,
  writeChunk: (chunk: UIMessageChunk) => void,
  observeChunk?: (chunk: UIMessageChunk) => void,
): Promise<void> => {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      observeChunk?.(value);
      writeChunk(value);
    }
  } finally {
    reader.releaseLock();
  }
};

const writeAssistantTextMessage = (input: {
  writeChunk: (chunk: UIMessageChunk) => void;
  text: string;
  finishReason?: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other";
}): void => {
  const messageId = createResponseMessageId();
  const textId = `text-${crypto.randomUUID()}`;
  input.writeChunk({ type: "start", messageId });
  input.writeChunk({ type: "text-start", id: textId });
  input.writeChunk({ type: "text-delta", id: textId, delta: input.text });
  input.writeChunk({ type: "text-end", id: textId });
  input.writeChunk({ type: "finish", finishReason: input.finishReason ?? "stop" });
};

const stripPreToolNarrationFromAssistantMessage = (message: UIMessage): UIMessage => {
  if (message.role !== "assistant") {
    return message;
  }

  const firstToolPartIndex = message.parts.findIndex((part) => isToolUIPart(part));
  if (firstToolPartIndex <= 0) {
    return message;
  }

  const sanitizedParts = message.parts.filter((part, index) => {
    if (index >= firstToolPartIndex) {
      return true;
    }
    return part.type !== "text" && part.type !== "reasoning";
  });

  if (sanitizedParts.length === message.parts.length) {
    return message;
  }

  return {
    ...message,
    parts: sanitizedParts,
  };
};

const filterPersistableMessages = (messages: UIMessage[]): UIMessage[] =>
  messages
    .map((message) => stripPreToolNarrationFromAssistantMessage(message))
    .filter(
      (message): message is UIMessage & { role: "assistant" | "system" | "user" } =>
        message.role === "assistant" || message.role === "system" || message.role === "user",
    );

const replaceLastAssistantMessageWithText = (messages: UIMessage[], text: string): UIMessage[] => {
  const nextMessages = [...messages];
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const message = nextMessages[index];
    if (message?.role !== "assistant") {
      continue;
    }
    nextMessages[index] = {
      ...message,
      parts: [{ type: "text", text }] as UIMessage["parts"],
    };
    return nextMessages;
  }

  return [
    ...nextMessages,
    {
      id: `msg-${crypto.randomUUID()}`,
      role: "assistant",
      parts: [{ type: "text", text }] as UIMessage["parts"],
    },
  ];
};

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

const stringifyJsonSafe = (value: unknown): string => JSON.stringify(
  value,
  (_key, nestedValue) => (typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue),
);

const serializeForLog = (value: unknown): string => {
  if (typeof value === "string") {
    return truncateText(value);
  }
  try {
    return truncateText(stringifyJsonSafe(value));
  } catch {
    return "[unserializable]";
  }
};

const serializeForToolCache = (value: unknown): string => {
  if (value === undefined) {
    return "undefined";
  }
  try {
    return stringifyJsonSafe(value) ?? "undefined";
  } catch {
    return "[unserializable]";
  }
};

const readStructuredErrorDetails = (
  error: unknown,
): { message: string; code?: number | string; errorType?: string } | null => {
  if (!error || typeof error !== "object") {
    return null;
  }

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "error" in error && error.error && typeof error.error === "object" && "message" in error.error && typeof error.error.message === "string"
        ? error.error.message
        : null;

  const code =
    "code" in error && (typeof error.code === "number" || typeof error.code === "string")
      ? error.code
      : undefined;

  const metadata =
    "metadata" in error && error.metadata && typeof error.metadata === "object"
      ? error.metadata
      : "error" in error && error.error && typeof error.error === "object" && "metadata" in error.error && error.error.metadata && typeof error.error.metadata === "object"
        ? error.error.metadata
        : undefined;

  const errorType =
    metadata && "error_type" in metadata && typeof metadata.error_type === "string"
      ? metadata.error_type
      : undefined;

  return message ? { message, code, errorType } : null;
};

const toRuntimeChatErrorMessage = (error: unknown): string => {
  const structured = readStructuredErrorDetails(error);
  const message = error instanceof Error ? error.message : structured?.message ?? String(error);
  const normalizedMessage = message.toLowerCase();
  const normalizedErrorType = structured?.errorType?.toLowerCase();
  if (message.includes("User not found")) {
    return "LLM authentication failed (OpenRouter: User not found). Update llm/openrouter/api-key in Vault secrets.";
  }
  if (message.includes("401")) {
    return `LLM request rejected with authentication error: ${message}`;
  }
  if (structured?.code === 502 || normalizedErrorType === "provider_unavailable") {
    return "The upstream AI provider is temporarily unavailable (502 provider_unavailable). Retry, or switch to a more reliable model in AI settings.";
  }
  if (
    normalizedMessage.includes("timeout")
    || normalizedMessage.includes("timed out")
    || normalizedMessage.includes("abort")
    || normalizedMessage.includes("aborted")
  ) {
    return "LLM request timed out before the model finished responding. Try again, or switch to a more reliable model in AI settings.";
  }
  return message;
};

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

const shouldUseWalletInventoryFastPath = (userMessage: string): boolean => {
  const normalized = normalizeIntentText(userMessage);
  if (!/\bwallets?\b/u.test(normalized) || hasWalletMutationIntent(normalized)) {
    return false;
  }

  const mentionsInventory = hasAnyIntentPhrase(normalized, WALLET_INVENTORY_INTENT_PHRASES);
  const mentionsContents = hasAnyIntentPhrase(normalized, WALLET_CONTENTS_INTENT_PHRASES);
  return mentionsInventory && !mentionsContents;
};

const shouldUseWalletContentsFastPath = (userMessage: string): boolean => {
  const normalized = normalizeIntentText(userMessage);
  if (!/\bwallets?\b/u.test(normalized) || hasWalletMutationIntent(normalized)) {
    return false;
  }

  if (hasAnyIntentPhrase(normalized, WALLET_CONTENTS_INTENT_PHRASES)) {
    return true;
  }

  return /\b(?:what|show|list|how)\b/u.test(normalized);
};

const formatWalletInventoryFastPathText = (data: unknown): string | null => {
  if (!isRecord(data) || !Array.isArray(data.wallets)) {
    return null;
  }

  const wallets = data.wallets
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      walletGroup: typeof entry.walletGroup === "string" ? entry.walletGroup : "",
      walletName: typeof entry.walletName === "string" ? entry.walletName : "",
      address: typeof entry.address === "string" ? entry.address : "",
    }))
    .filter((entry) => entry.walletName.length > 0 && entry.address.length > 0);

  if (wallets.length === 0) {
    return "No managed wallets were found.";
  }

  const walletGroups = [...new Set(wallets.map((wallet) => wallet.walletGroup).filter((walletGroup) => walletGroup.length > 0))];
  const heading =
    walletGroups.length === 1
      ? `We have ${wallets.length} managed wallet${wallets.length === 1 ? "" : "s"} in the ${walletGroups[0]} group:`
      : `We have ${wallets.length} managed wallet${wallets.length === 1 ? "" : "s"} across ${walletGroups.length} groups:`;

  const lines = wallets.map((wallet) =>
    walletGroups.length === 1
      ? `- ${wallet.walletName}: ${wallet.address}`
      : `- ${wallet.walletGroup}/${wallet.walletName}: ${wallet.address}`,
  );

  return [heading, ...lines].join("\n");
};

const formatWalletContentsFastPathText = (data: unknown): string | null => {
  if (!isRecord(data) || !Array.isArray(data.wallets)) {
    return null;
  }

  const wallets = data.wallets
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      walletGroup: typeof entry.walletGroup === "string" ? entry.walletGroup : "",
      walletName: typeof entry.walletName === "string" ? entry.walletName : "",
      address: typeof entry.address === "string" ? entry.address : "",
      balanceSol: typeof entry.balanceSol === "number" ? entry.balanceSol : 0,
      collectibleCount: typeof entry.collectibleCount === "number" ? entry.collectibleCount : 0,
      tokenBalances: Array.isArray(entry.tokenBalances)
        ? entry.tokenBalances.filter((token): token is Record<string, unknown> => isRecord(token))
        : [],
    }))
    .filter((entry) => entry.walletName.length > 0 && entry.address.length > 0);

  if (wallets.length === 0) {
    return "No managed wallet contents were found.";
  }

  const header = `Here are the contents for ${wallets.length} managed wallet${wallets.length === 1 ? "" : "s"}:`;
  const lines = wallets.flatMap((wallet) => {
    const tokenSummary = wallet.tokenBalances.length === 0
      ? ["  Tokens: none"]
      : wallet.tokenBalances.slice(0, 6).map((token) => {
          const mintAddress = typeof token.mintAddress === "string" ? token.mintAddress : "unknown-mint";
          const symbol = typeof token.symbol === "string" && token.symbol.trim().length > 0 ? token.symbol.trim() : null;
          const balanceUiString = typeof token.balanceUiString === "string" ? token.balanceUiString : "0";
          const valueUsd = typeof token.valueUsd === "number" && Number.isFinite(token.valueUsd) ? token.valueUsd : null;
          const label = symbol ? `${symbol} (${mintAddress})` : mintAddress;
          return `  Token ${label}: ${balanceUiString}${valueUsd !== null ? ` (~$${valueUsd.toFixed(2)})` : ""}`;
        });
    const collectibleSummary = wallet.collectibleCount > 0
      ? [`  Collectibles: ${wallet.collectibleCount}`]
      : [];

    return [
      `- ${wallet.walletName}: ${wallet.balanceSol} SOL (${wallet.address})`,
      ...collectibleSummary,
      ...tokenSummary,
    ];
  });

  return [header, ...lines].join("\n");
};

const formatWalletContentsRateLimitText = (toolName: string, error: string): string | null => {
  if (toolName !== "getManagedWalletContents") {
    return null;
  }

  const normalized = error.toLowerCase();
  if (
    normalized.includes("429")
    || normalized.includes("too many requests")
    || normalized.includes("rate limit")
  ) {
    return [
      "I couldn't load wallet contents because the current RPC provider is rate-limiting this request.",
      "`getManagedWalletContents` hit `429 Too Many Requests` while reading managed-wallet balances.",
      "Try again after the cooldown, or configure a dedicated private RPC provider such as Helius.",
    ].join("\n");
  }

  return null;
};

const formatTransferToolResultText = (output: unknown): string | null => {
  if (!isRecord(output) || output.ok !== true || !isRecord(output.data)) {
    return null;
  }

  const data = output.data;
  const transferType = data.transferType;
  const sourceAddress = typeof data.sourceAddress === "string" ? data.sourceAddress : null;
  const destination = typeof data.destination === "string" ? data.destination : null;
  const amountRaw = typeof data.amountRaw === "string" ? data.amountRaw : null;
  const amountUi = typeof data.amountUi === "number" ? data.amountUi : null;
  const txSignature = typeof data.txSignature === "string" ? data.txSignature : null;
  if (
    (transferType !== "sol" && transferType !== "spl")
    || !sourceAddress
    || !destination
    || !amountRaw
    || amountUi === null
    || !txSignature
  ) {
    return null;
  }

  const assetText =
    transferType === "sol"
      ? "SOL"
      : `token mint \`${typeof data.mintAddress === "string" ? data.mintAddress : "unknown"}\``;

  return [
    `Transfer submitted successfully.`,
    `Moved \`${amountRaw}\` raw unit(s) (${amountUi}) of ${assetText} from \`${sourceAddress}\` to \`${destination}\`.`,
    `Transaction signature: \`${txSignature}\`.`,
  ].join("\n");
};

const formatCloseTokenAccountToolResultText = (output: unknown): string | null => {
  if (!isRecord(output) || output.ok !== true || !isRecord(output.data)) {
    return null;
  }

  const data = output.data;
  const tokenAccountAddress = typeof data.tokenAccountAddress === "string" ? data.tokenAccountAddress : null;
  const destination = typeof data.destination === "string" ? data.destination : null;
  const txSignature = typeof data.txSignature === "string" ? data.txSignature : null;
  if (!tokenAccountAddress || !destination || !txSignature) {
    return null;
  }

  return [
    `Token account closed successfully.`,
    `Closed \`${tokenAccountAddress}\` and sent the reclaimed rent to \`${destination}\`.`,
    `Transaction signature: \`${txSignature}\`.`,
  ].join("\n");
};

const formatKnownToolOnlyCompletionText = (message: UIMessage | undefined): string | null => {
  if (!message || message.role !== "assistant") {
    return null;
  }

  for (const part of message.parts) {
    if (!isToolLikePart(part)) {
      continue;
    }

    const toolName = part.type.slice(5);
    const output = "output" in part ? part.output : undefined;

    if (isRecord(output) && output.ok === false && typeof output.error === "string") {
      return formatWalletContentsRateLimitText(toolName, output.error)
        ?? `The request failed while running ${toolName}: ${output.error}`;
    }

    if (toolName === "getManagedWalletContents") {
      const walletContentsOutput =
        isRecord(output) && output.ok === true && "data" in output
          ? output.data
          : output;
      const formatted = formatWalletContentsFastPathText(walletContentsOutput);
      if (formatted) {
        return formatted;
      }
    }

    if (toolName === "transfer") {
      const formatted = formatTransferToolResultText(output);
      if (formatted) {
        return formatted;
      }
    }

    if (toolName === "closeTokenAccount") {
      const formatted = formatCloseTokenAccountToolResultText(output);
      if (formatted) {
        return formatted;
      }
    }
  }

  return null;
};

function createToolPartFromStreamState(input: {
  toolName: string;
  toolCallId: string;
  state: "input-available";
  input: unknown;
}): UIMessage["parts"][number];
function createToolPartFromStreamState(input: {
  toolName: string;
  toolCallId: string;
  state: "output-available";
  input: unknown;
  output: unknown;
}): UIMessage["parts"][number];
function createToolPartFromStreamState(input: {
  toolName: string;
  toolCallId: string;
  state: "input-available" | "output-available";
  input: unknown;
  output?: unknown;
}): UIMessage["parts"][number] {
  if (input.state === "input-available") {
    return {
      type: `tool-${input.toolName}`,
      toolCallId: input.toolCallId,
      state: "input-available",
      input: input.input,
    };
  }

  return {
    type: `tool-${input.toolName}`,
    toolCallId: input.toolCallId,
    state: "output-available",
    input: input.input,
    output: input.output,
  };
}

const createDirectToolResultStreamResponse = (input: {
  headers?: HeadersInit;
  chatId: string;
  originalMessages: UIMessage[];
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput: unknown;
  text: string;
  onFinish: (messages: UIMessage[]) => void;
}): Response => {
  const toolCallId = `tool-${crypto.randomUUID()}`;
  const textId = `text-${crypto.randomUUID()}`;

  const stream = createUIMessageStream({
    originalMessages: input.originalMessages,
    execute: ({ writer }) => {
      writer.write({ type: "start", messageId: createResponseMessageId() });
      writer.write({ type: "start-step" });
      writer.write({ type: "tool-input-start", toolCallId, toolName: input.toolName });
      writer.write({
        type: "tool-input-available",
        toolCallId,
        toolName: input.toolName,
        input: input.toolInput,
      });
      writer.write({
        type: "tool-output-available",
        toolCallId,
        output: input.toolOutput,
      });
      writer.write({ type: "finish-step" });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: input.text });
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish", finishReason: "stop" });
    },
    onError: (error) => toRuntimeChatErrorMessage(error),
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
            jupiterUltra: deps.jupiterUltra,
            jupiterTrigger: deps.jupiterTrigger,
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
            jupiterUltra: deps.jupiterUltra,
            jupiterTrigger: deps.jupiterTrigger,
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

                const firstPassStream = firstResult.toUIMessageStream({
                  originalMessages: validatedMessages,
                  sendReasoning: false,
                  onError: (error) => toRuntimeChatErrorMessage(error),
                  onFinish: ({ messages: completedMessages, responseMessage }) => {
                    firstPassMessages = completedMessages;
                    firstResponseMessage = responseMessage;
                  },
                });
                await Promise.all([
                  firstResult.consumeStream(),
                  pipeUIMessageStream(firstPassStream, (chunk) => {
                    if (isReasoningChunk(chunk)) {
                      return;
                    }
                    if (!streamSawToolActivity) {
                      if (uiChunkHasToolActivity(chunk)) {
                        streamSawToolActivity = true;
                        flushQueuedPreToolChunks("structural-only");
                      } else {
                        queuedPreToolChunks.push(chunk);
                        return;
                      }
                    }
                    writer.write(chunk);
                  }, (chunk) => {
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
                      if (uiChunkHasVisibleText(chunk)) {
                        if (streamSawToolActivity) {
                          firstPassSawTextAfterToolActivity = true;
                        }
                      }
                    }),
                ]);
                if (queuedPreToolChunks.length > 0) {
                  flushQueuedPreToolChunks("all");
                }

                const completedAssistantMessage = firstResponseMessage ?? findLatestAssistantMessage(firstPassMessages);
                const completedAssistantHasToolActivity = assistantMessageHasToolActivity(completedAssistantMessage);
                const completedAssistantHasTextAfterToolActivity = assistantMessageHasTextAfterToolActivity(completedAssistantMessage);
                const firstPassHadToolActivity = streamSawToolActivity || completedAssistantHasToolActivity;
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
                        id: `msg-${crypto.randomUUID()}`,
                        role: "assistant" as const,
                        parts: observedToolParts,
                      }
                    : undefined;
                const executedToolParts = Array.from(executedToolResults.values()).map((result) =>
                  createToolPartFromStreamState({
                    toolName: result.actionName,
                    toolCallId: `tool-${crypto.randomUUID()}`,
                    state: "output-available",
                    input: result.rawInput ?? null,
                    output: result.output,
                  }));
                const executedToolMessage =
                  executedToolParts.length > 0
                    ? {
                        id: `msg-${crypto.randomUUID()}`,
                        role: "assistant" as const,
                        parts: executedToolParts,
                      }
                    : undefined;

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
                    ...firstPassMessages,
                    {
                      id: `msg-${crypto.randomUUID()}`,
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
