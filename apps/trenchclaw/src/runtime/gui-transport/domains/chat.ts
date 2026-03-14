import type {
  GuiConversationMessagesResponse,
  GuiConversationsResponse,
  GuiDeleteConversationResponse,
} from "@trenchclaw/types";
import type { UIMessage } from "ai";
import { CORS_HEADERS } from "../constants";
import type { RuntimeGuiDomainContext } from "../contracts";

export const streamChat = async (
  context: RuntimeGuiDomainContext,
  messages: UIMessage[],
  input?: { chatId?: string; conversationTitle?: string; abortSignal?: AbortSignal },
): Promise<Response> => {
  const chatId = input?.chatId?.trim() || context.resolveDefaultChatId();
  context.setActiveChatId(chatId);
  context.addActivity("chat", `Streaming prompt received (${messages.length} message${messages.length === 1 ? "" : "s"})`);
  return context.runtime.chat.stream(messages, {
    headers: CORS_HEADERS,
    chatId,
    sessionId: context.getActiveInstance()?.localInstanceId,
    conversationTitle: input?.conversationTitle,
    abortSignal: input?.abortSignal,
  });
};

export const getConversations = (context: RuntimeGuiDomainContext, limit = 100): GuiConversationsResponse => ({
  conversations: context.listInstanceConversations(limit),
});

export const getConversationMessages = (
  context: RuntimeGuiDomainContext,
  conversationId: string,
  limit = 500,
): GuiConversationMessagesResponse => {
  const normalizedConversationId = conversationId.trim();
  if (!normalizedConversationId) {
    throw new Error("Conversation id is required");
  }

  const conversation = context.runtime.stateStore.getConversation(normalizedConversationId);
  if (!conversation) {
    throw new Error(`Conversation not found: ${normalizedConversationId}`);
  }

  const activeInstanceId = context.getActiveInstance()?.localInstanceId;
  if (activeInstanceId && conversation.sessionId && conversation.sessionId !== activeInstanceId) {
    throw new Error("Conversation is not accessible for the current instance");
  }

  const normalizedLimit = Math.max(1, Math.trunc(limit));
  const messages = context.runtime.stateStore.listChatMessages(normalizedConversationId, normalizedLimit).map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    parts: Array.isArray(message.metadata?.uiParts)
      ? (message.metadata.uiParts as Array<Record<string, unknown>>)
      : undefined,
    createdAt: message.createdAt,
  }));

  return {
    conversationId: normalizedConversationId,
    messages,
  };
};

export const deleteConversation = (
  context: RuntimeGuiDomainContext,
  conversationId: string,
): GuiDeleteConversationResponse => {
  const normalizedConversationId = conversationId.trim();
  if (!normalizedConversationId) {
    throw new Error("Conversation id is required");
  }

  const conversation = context.runtime.stateStore.getConversation(normalizedConversationId);
  if (!conversation) {
    throw new Error(`Conversation not found: ${normalizedConversationId}`);
  }

  const activeInstanceId = context.getActiveInstance()?.localInstanceId;
  if (activeInstanceId && conversation.sessionId && conversation.sessionId !== activeInstanceId) {
    throw new Error("Conversation is not accessible for the current instance");
  }

  const deleted = context.runtime.stateStore.deleteConversation(normalizedConversationId);
  if (!deleted) {
    throw new Error(`Conversation not found: ${normalizedConversationId}`);
  }

  if (context.getActiveChatId() === normalizedConversationId) {
    context.setActiveChatId(null);
  }

  const conversationLabel = conversation.title?.trim() || normalizedConversationId;
  context.addActivity("chat", `Deleted conversation ${conversationLabel}`);

  return {
    conversationId: normalizedConversationId,
  };
};
