import { isToolUIPart, type UIMessage } from "ai";
import { createChatMessageId, createConversationId } from "../../ai/contracts/types/ids";
import { isRecord } from "../shared/object-utils";
import { WALLET_MUTATION_INTENT_TOKENS } from "./constants";

export { isRecord } from "../shared/object-utils";

export const trimOrUndefinedValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

export const normalizeIntentText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

export const hasAnyIntentPhrase = (haystack: string, phrases: readonly string[]): boolean =>
  phrases.some((phrase) => haystack.includes(phrase));

export const hasWalletMutationIntent = (userMessage: string): boolean => {
  const normalized = normalizeIntentText(userMessage);
  return hasAnyIntentPhrase(normalized, WALLET_MUTATION_INTENT_TOKENS);
};

export const isToolLikePart = (value: unknown): value is Record<string, unknown> & { type: string } =>
  isRecord(value) && typeof value.type === "string" && value.type.startsWith("tool-");

export const extractUiMessageText = (message: UIMessage): string => {
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

  return text.length > 0 ? text : "";
};

export const createResponseMessageId = (): string => createChatMessageId();

export const assistantMessageHasToolActivity = (message: UIMessage | undefined): boolean => {
  if (!message || message.role !== "assistant") {
    return false;
  }
  return message.parts.some((part) => isToolUIPart(part));
};

export const assistantMessageHasTextAfterToolActivity = (message: UIMessage | undefined): boolean => {
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

export const findLatestAssistantMessage = (messages: UIMessage[]): UIMessage | undefined => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message;
    }
  }
  return undefined;
};

export const truncateText = (value: string, maxLength = 1_500): string =>
  value.length > maxLength ? `${value.slice(0, maxLength)}…[truncated]` : value;

export const stringifyJsonSafe = (value: unknown): string => JSON.stringify(
  value,
  (_key, nestedValue) => (typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue),
);

export const serializeForLog = (value: unknown): string => {
  if (typeof value === "string") {
    return truncateText(value);
  }
  try {
    return truncateText(stringifyJsonSafe(value));
  } catch {
    return "[unserializable]";
  }
};

export const serializeForToolCache = (value: unknown): string => {
  if (value === undefined) {
    return "undefined";
  }
  try {
    return stringifyJsonSafe(value) ?? "undefined";
  } catch {
    return "[unserializable]";
  }
};

export const readStructuredErrorDetails = (
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

export const toRuntimeChatErrorMessage = (error: unknown): string => {
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

export const resolveChatId = (chatId: string | undefined): string =>
  trimOrUndefinedValue(chatId) ?? createConversationId();
