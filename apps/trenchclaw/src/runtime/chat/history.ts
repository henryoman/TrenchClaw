import type { UIMessage } from "ai";

import type { ChatMessageId } from "../../ai/contracts/types/ids";
import type { ChatMessageState, ConversationHistorySlice } from "../../ai/contracts/types/state";
import { extractUiMessageText, trimOrUndefinedValue } from "./utils";

/** Approximate token budget for persisted same-conversation messages prepended to the model thread (newest backward until full). */
export const DEFAULT_CONVERSATION_HISTORY_TOKEN_BUDGET = 10_000;
/** Budget for each `getConversationHistorySlice` continuation the model requests via `queryRuntimeStore`. */
export const DEFAULT_CONVERSATION_HISTORY_SLICE_TOKEN_BUDGET = 8_000;
export const DEFAULT_CONVERSATION_HISTORY_SLICE_LIMIT = 80;
export const MAX_CONVERSATION_HISTORY_SCAN_MESSAGES = 10_000;

/** Extra tokens assumed per history message for `[History #…]` line prefixes in the model-facing transcript. */
export const HISTORY_MESSAGE_TAG_OVERHEAD_TOKENS = 28;

const clampPositiveInt = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(value ?? fallback));
};

const compareChatMessages = (left: ChatMessageState, right: ChatMessageState): number =>
  left.createdAt - right.createdAt || left.id.localeCompare(right.id);

const normalizePartForFingerprint = (part: unknown): unknown => {
  if (!part || typeof part !== "object") {
    return part;
  }

  const record = part as Record<string, unknown>;
  if (record.type === "text" || record.type === "reasoning") {
    return {
      type: record.type,
      text: typeof record.text === "string" ? record.text.trim() : "",
    };
  }

  return record;
};

const buildMessageFingerprint = (message: UIMessage): string =>
  JSON.stringify({
    role: message.role,
    parts: message.parts.map((part) => normalizePartForFingerprint(part)),
  });

export const isReplayableUiMessage = (message: UIMessage): boolean =>
  message.parts.some((part) => {
    if (part.type === "text" || part.type === "reasoning") {
      return typeof part.text === "string" && part.text.trim().length > 0;
    }
    return true;
  });

export const replayChatMessageState = (message: ChatMessageState): UIMessage => {
  const storedUiParts = message.metadata?.uiParts;
  const parts =
    Array.isArray(storedUiParts)
      ? (storedUiParts as UIMessage["parts"])
      : message.content.trim().length > 0
        ? ([{ type: "text", text: message.content }] as UIMessage["parts"])
        : ([] as UIMessage["parts"]);

  return {
    id: message.id,
    role: message.role === "tool" ? "assistant" : message.role,
    parts,
  };
};

export const estimateUiMessageTokens = (message: UIMessage): number => {
  if (!isReplayableUiMessage(message)) {
    return 0;
  }
  const text = extractUiMessageText(message);
  const serializedParts =
    text.length > 0
      ? text
      : JSON.stringify(message.parts, (_key, value) => (typeof value === "bigint" ? value.toString() : value)) ?? "";

  return Math.max(1, Math.ceil(serializedParts.length / 4) + 8);
};

export const estimateChatMessageTokens = (message: ChatMessageState): number =>
  estimateUiMessageTokens(replayChatMessageState(message));

export const selectConversationHistoryMessages = (input: {
  messages: ChatMessageState[];
  limit?: number;
  tokenBudget?: number;
}): {
  messages: ChatMessageState[];
  estimatedTokenCount: number;
} => {
  const ordered = [...input.messages].sort(compareChatMessages);
  const limit = clampPositiveInt(input.limit, DEFAULT_CONVERSATION_HISTORY_SLICE_LIMIT);
  const tokenBudget = clampPositiveInt(input.tokenBudget, DEFAULT_CONVERSATION_HISTORY_SLICE_TOKEN_BUDGET);
  const selectedFromNewest: ChatMessageState[] = [];
  let estimatedTokenCount = 0;

  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (selectedFromNewest.length >= limit) {
      break;
    }

    const message = ordered[index]!;
    const estimatedTokens = estimateChatMessageTokens(message) + HISTORY_MESSAGE_TAG_OVERHEAD_TOKENS;
    if (selectedFromNewest.length > 0 && estimatedTokenCount + estimatedTokens > tokenBudget) {
      break;
    }

    selectedFromNewest.push(message);
    estimatedTokenCount += estimatedTokens;
  }

  return {
    messages: selectedFromNewest.reverse(),
    estimatedTokenCount,
  };
};

export const createConversationHistorySlice = (input: {
  conversationId: string;
  eligibleMessages: ChatMessageState[];
  totalEligibleCount: number;
  beforeMessageId?: string;
  limit?: number;
  tokenBudget?: number;
}): ConversationHistorySlice => {
  const selected = selectConversationHistoryMessages({
    messages: input.eligibleMessages,
    limit: input.limit,
    tokenBudget: input.tokenBudget,
  });
  const oldestReturnedMessageId = selected.messages[0]?.id;
  const newestReturnedMessageId = selected.messages.at(-1)?.id;
  const hasMoreBefore = input.totalEligibleCount > selected.messages.length;

  return {
    conversationId: input.conversationId,
    requestedBeforeMessageId: trimOrUndefinedValue(input.beforeMessageId) as ChatMessageId | undefined,
    messages: selected.messages,
    estimatedTokenCount: selected.estimatedTokenCount,
    hasMoreBefore,
    nextBeforeMessageId: hasMoreBefore ? oldestReturnedMessageId : undefined,
    oldestReturnedMessageId,
    newestReturnedMessageId,
  };
};

export const excludeCurrentConversationOverlap = (input: {
  historyMessages: ChatMessageState[];
  currentMessages: UIMessage[];
}): ChatMessageState[] => {
  const currentMessageIds = new Set(
    input.currentMessages
      .map((message) => trimOrUndefinedValue(message.id))
      .filter((value): value is string => typeof value === "string"),
  );
  const withoutExactIdOverlap = input.historyMessages.filter((message) => !currentMessageIds.has(message.id));
  if (withoutExactIdOverlap.length === 0 || input.currentMessages.length === 0) {
    return withoutExactIdOverlap;
  }

  const historyFingerprints = withoutExactIdOverlap.map((message) => buildMessageFingerprint(replayChatMessageState(message)));
  const currentFingerprints = input.currentMessages.map((message) => buildMessageFingerprint(message));
  const maxOverlap = Math.min(historyFingerprints.length, currentFingerprints.length);

  for (let overlapSize = maxOverlap; overlapSize >= 1; overlapSize -= 1) {
    let matches = true;
    for (let offset = 0; offset < overlapSize; offset += 1) {
      if (historyFingerprints[historyFingerprints.length - overlapSize + offset] !== currentFingerprints[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return withoutExactIdOverlap.slice(0, -overlapSize);
    }
  }

  return withoutExactIdOverlap;
};

const buildHistoryMessageTagPrefix = (input: { ordinal: number; total: string; message: UIMessage }): string =>
  `[History #${input.ordinal}/${input.total} | messageId=${input.message.id} | role=${input.message.role}]\n`;

/**
 * Prefixes each persisted history row so the model can cite stable ordinals and pass `messageId` into
 * `queryRuntimeStore` → `getConversationHistorySlice` for older context.
 */
export const tagHistoryUiMessagesForModelContext = (messages: UIMessage[]): UIMessage[] => {
  const total = messages.length;
  if (total === 0) {
    return messages;
  }
  const totalLabel = String(total);

  return messages.map((message, index) => {
    const ordinal = index + 1;
    const prefix = buildHistoryMessageTagPrefix({ ordinal, total: totalLabel, message });

    let prefixed = false;
    const parts = message.parts.map((part) => {
      if (
        !prefixed
        && (part.type === "text" || part.type === "reasoning")
        && typeof (part as { text?: string }).text === "string"
      ) {
        prefixed = true;
        return { ...part, text: prefix + (part as { text: string }).text };
      }
      return part;
    });

    if (!prefixed) {
      return {
        ...message,
        parts: [{ type: "text", text: prefix.trimEnd() }, ...message.parts] as UIMessage["parts"],
      };
    }

    return { ...message, parts };
  });
};

