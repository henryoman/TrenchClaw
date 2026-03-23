import type { UIMessage } from "ai";
import { createChatMessageId } from "../../ai/runtime/types/ids";
import type { RuntimeChatServiceDeps } from "./types";
import { extractUiMessageText, trimOrUndefinedValue } from "./utils";

const hasReplayableParts = (message: UIMessage): boolean =>
  message.parts.some((part) => {
    if (part.type === "text" || part.type === "reasoning") {
      return typeof part.text === "string" && part.text.trim().length > 0;
    }
    return true;
  });

const stripPreToolNarrationFromAssistantMessage = (message: UIMessage): UIMessage => {
  if (message.role !== "assistant") {
    return message;
  }

  const firstToolPartIndex = message.parts.findIndex((part) => part.type.startsWith("tool-"));
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
    )
    .filter((message) => hasReplayableParts(message));

export const replaceLastAssistantMessageWithText = (messages: UIMessage[], text: string): UIMessage[] => {
  const nextMessages = [...messages];
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const message = nextMessages[index];
    if (message?.role !== "assistant") {
      continue;
    }
    const preservedParts = message.parts.filter((part) => part.type !== "text" && part.type !== "reasoning");
    nextMessages[index] = {
      ...message,
      parts: [...preservedParts, { type: "text", text }] as UIMessage["parts"],
    };
    return nextMessages;
  }

  return [
    ...nextMessages,
    {
      id: createChatMessageId(),
      role: "assistant",
      parts: [{ type: "text", text }] as UIMessage["parts"],
    },
  ];
};

export const sanitizeConversationTitle = (title: string | undefined, fallbackMessages: UIMessage[]): string | undefined => {
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

export const withChatHeaders = (headers: HeadersInit | undefined, chatId: string): Headers => {
  const merged = new Headers(headers);
  merged.set("x-trenchclaw-chat-id", chatId);
  return merged;
};

export const persistFinishedMessages = (
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
      id: trimOrUndefinedValue(message.id) ?? createChatMessageId(`${chatId}-${updatedAt + index}`),
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
