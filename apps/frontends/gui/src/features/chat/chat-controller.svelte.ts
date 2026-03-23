import { Chat } from "@ai-sdk/svelte";
import { DefaultChatTransport } from "ai";
import type { GuiConversationMessageView, GuiConversationView } from "@trenchclaw/types";
import type { UIMessage } from "ai";
import { CHAT_API_PATH, CHAT_STREAM_TIMEOUT_MS, DEFAULT_CHAT_ERROR } from "../../config/app-config";
import { runtimeApi, toRuntimeUrl } from "../../runtime-api";
import { createTimedStreamingFetch } from "./chat-transport";

interface ChatUiState {
  input: string;
  runtimeError: string;
  activeConversationId: string | null;
  conversations: GuiConversationView[];
  deletingConversations: boolean;
  visibleMessages: UIMessage[];
}

const toFallbackTitle = (unixMs: number): string => new Date(unixMs).toISOString();
const NEW_CONVERSATION_TITLE = "New chat";

const extractErrorText = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return extractErrorText(error.message);
  }

  if (error && typeof error === "object") {
    if ("message" in error) {
      return extractErrorText(error.message);
    }
    if ("error" in error) {
      return extractErrorText(error.error);
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
};

const toDisplayErrorText = (rawError: unknown): string => {
  const rawErrorText = extractErrorText(rawError).trim();
  if (!rawErrorText) {
    return DEFAULT_CHAT_ERROR;
  }

  if (rawErrorText.includes("User not found")) {
    return "Your AI provider key is invalid. Update it in AI settings.";
  }

  if (
    rawErrorText.includes("provider_unavailable")
    || rawErrorText.includes("Provider returned error")
    || rawErrorText.includes("502")
  ) {
    return "The selected AI model is temporarily unavailable. Retry, or switch models in AI settings.";
  }

  if (rawErrorText.includes("Chat request timed out after")) {
    return "The model stopped responding in time. Retry, or narrow the request.";
  }

  return rawErrorText;
};

const hasTerminalAssistantText = (messages: UIMessage[]): boolean => {
  const lastMessage = messages.at(-1);
  if (!lastMessage || lastMessage.role !== "assistant") {
    return false;
  }
  return lastMessage.parts.some(
    (part) => part.type === "text" && typeof part.text === "string" && part.text.trim().length > 0,
  );
};

const isUiMessagePart = (value: unknown): value is UIMessage["parts"][number] =>
  typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

const isRenderableUiMessagePart = (part: UIMessage["parts"][number]): boolean => {
  if (part.type === "text" || part.type === "reasoning") {
    return typeof part.text === "string" && part.text.trim().length > 0;
  }
  return true;
};

const toUiMessageParts = (message: GuiConversationMessageView): UIMessage["parts"] => {
  const persistedParts = Array.isArray(message.parts)
    ? message.parts.filter(isUiMessagePart).filter(isRenderableUiMessagePart)
    : [];
  if (persistedParts.length > 0) {
    return persistedParts;
  }

  if (!message.content.trim()) {
    return [];
  }

  return [
    {
      type: "text",
      text: message.content,
    },
  ];
};

export const createChatController = () => {
  const state = $state<ChatUiState>({
    input: "",
    runtimeError: "",
    activeConversationId: null,
    conversations: [],
    deletingConversations: false,
    visibleMessages: [],
  });
  const draftConversationIds = new Set<string>();
  let activeStreamConversationId = $state<string | null>(null);
  let messageCacheByConversationId = $state<Record<string, UIMessage[]>>({});
  let streamingMirrorIntervalId: ReturnType<typeof setInterval> | null = null;

  const toConversationView = (conversation: GuiConversationView): GuiConversationView => ({
    ...conversation,
    title: conversation.title?.trim() || toFallbackTitle(conversation.createdAt),
  });

  const setCachedMessages = (conversationId: string, messages: UIMessage[]): void => {
    messageCacheByConversationId = {
      ...messageCacheByConversationId,
      [conversationId]: messages,
    };
  };

  const getCachedMessages = (conversationId: string): UIMessage[] => messageCacheByConversationId[conversationId] ?? [];

  const clearCachedMessages = (conversationId: string): void => {
    const { [conversationId]: _removed, ...rest } = messageCacheByConversationId;
    messageCacheByConversationId = rest;
  };

  const isStreamingConversation = (conversationId: string | null | undefined): boolean =>
    Boolean(conversationId && activeStreamConversationId === conversationId && isSending());

  const isActiveConversationStreaming = (): boolean => isStreamingConversation(state.activeConversationId);

  const getActiveConversationChatStatus = (): "submitted" | "streaming" | "ready" | "error" =>
    isActiveConversationStreaming() ? chat.status : "ready";

  const syncTransportMessagesWhenIdle = (messages: UIMessage[]): void => {
    if (isSending()) {
      return;
    }
    chat.messages = messages;
  };

  const syncStreamingConversationMessages = (): void => {
    const streamingConversationId = activeStreamConversationId;
    if (!streamingConversationId) {
      return;
    }

    const liveMessages = chat.messages as UIMessage[];
    setCachedMessages(streamingConversationId, liveMessages);
    if (state.activeConversationId === streamingConversationId) {
      state.visibleMessages = liveMessages;
    }
  };

  const stopStreamingMirror = (): void => {
    syncStreamingConversationMessages();
    if (streamingMirrorIntervalId !== null) {
      clearInterval(streamingMirrorIntervalId);
      streamingMirrorIntervalId = null;
    }
    activeStreamConversationId = null;
  };

  const startStreamingMirror = (conversationId: string): void => {
    stopStreamingMirror();
    activeStreamConversationId = conversationId;
    syncStreamingConversationMessages();
    streamingMirrorIntervalId = setInterval(() => {
      syncStreamingConversationMessages();
    }, 16);
  };

  const ensureActiveConversationId = (): string => {
    if (state.activeConversationId) {
      return state.activeConversationId;
    }

    const now = Date.now();
    const conversationId = `chat-${crypto.randomUUID()}`;
    state.activeConversationId = conversationId;
    state.conversations = [
      {
        id: conversationId,
        title: NEW_CONVERSATION_TITLE,
        createdAt: now,
        updatedAt: now,
      },
      ...state.conversations,
    ];
    draftConversationIds.add(conversationId);
    setCachedMessages(conversationId, []);
    state.visibleMessages = [];
    return conversationId;
  };

  const toUiMessages = (messages: GuiConversationMessageView[]) =>
    messages
      .filter((message): message is GuiConversationMessageView & { role: "assistant" | "system" | "user" } => message.role !== "tool")
      .map((message) => ({
        id: message.id,
        role: message.role,
        parts: toUiMessageParts(message),
      }))
      .filter((message) => message.parts.length > 0);

  const chat = new Chat({
    transport: new DefaultChatTransport({
      api: toRuntimeUrl(CHAT_API_PATH),
      fetch: createTimedStreamingFetch(CHAT_STREAM_TIMEOUT_MS) as unknown as typeof fetch,
      prepareSendMessagesRequest: ({ id, messages, body }) => {
        const chatId = ensureActiveConversationId();
        const activeConversation = state.conversations.find((conversation) => conversation.id === chatId);
        const conversationTitle =
          activeConversation?.title && activeConversation.title !== NEW_CONVERSATION_TITLE
            ? activeConversation.title
            : undefined;
        return {
          body: {
            id,
            messages,
            ...body,
            chatId,
            conversationTitle,
          },
        };
      },
    }),
    onError: (error) => {
      state.runtimeError = toDisplayErrorText(error);
      void runtimeApi.reportClientError({
        source: "gui-chat",
        message: state.runtimeError,
        metadata: {
          chatStatus: chat.status,
          conversationId: activeStreamConversationId ?? state.activeConversationId,
        },
      }).catch(() => {
        // Best effort only; keep UI responsive even when runtime cannot accept error telemetry.
      });
    },
  });

  const isSending = (): boolean => chat.status === "submitted" || chat.status === "streaming";

  const refreshConversations = async (): Promise<void> => {
    const response = await runtimeApi.conversations();
    const persistedConversations = response.conversations.map(toConversationView);
    const persistedConversationIds = new Set(persistedConversations.map((conversation) => conversation.id));
    for (const conversationId of persistedConversationIds) {
      draftConversationIds.delete(conversationId);
    }

    const draftConversations = state.conversations.filter(
      (conversation) => draftConversationIds.has(conversation.id) && !persistedConversationIds.has(conversation.id),
    );
    state.conversations = [...draftConversations, ...persistedConversations];
    if (state.activeConversationId && state.conversations.some((conversation) => conversation.id === state.activeConversationId)) {
      return;
    }
    state.activeConversationId = state.conversations[0]?.id ?? null;
    state.visibleMessages = state.activeConversationId ? getCachedMessages(state.activeConversationId) : [];
  };

  const selectConversation = async (conversationId: string): Promise<void> => {
    const nextConversationId = conversationId.trim();
    if (!nextConversationId) {
      return;
    }

    state.runtimeError = "";
    state.activeConversationId = nextConversationId;

    const cachedMessages = getCachedMessages(nextConversationId);
    state.visibleMessages = cachedMessages;
    syncTransportMessagesWhenIdle(cachedMessages);

    if (draftConversationIds.has(nextConversationId)) {
      state.visibleMessages = cachedMessages;
      return;
    }

    if (isStreamingConversation(nextConversationId)) {
      state.visibleMessages = chat.messages;
      return;
    }

    const response = await runtimeApi.conversationMessages(nextConversationId);
    const nextMessages = toUiMessages(response.messages);
    setCachedMessages(nextConversationId, nextMessages);
    if (state.activeConversationId !== nextConversationId || isStreamingConversation(nextConversationId)) {
      return;
    }
    state.visibleMessages = nextMessages;
    syncTransportMessagesWhenIdle(nextMessages);
  };

  const initialize = async (): Promise<void> => {
    await refreshConversations();
    if (!state.activeConversationId) {
      state.visibleMessages = [];
      chat.messages = [];
      return;
    }

    await selectConversation(state.activeConversationId);
  };

  const createNewConversation = (): void => {
    if (state.deletingConversations) {
      return;
    }
    const now = Date.now();
    const conversationId = `chat-${crypto.randomUUID()}`;
    state.activeConversationId = conversationId;
    state.runtimeError = "";
    state.conversations = [
      {
        id: conversationId,
        title: NEW_CONVERSATION_TITLE,
        createdAt: now,
        updatedAt: now,
      },
      ...state.conversations.filter((conversation) => conversation.id !== conversationId),
    ];
    draftConversationIds.add(conversationId);
    setCachedMessages(conversationId, []);
    state.visibleMessages = [];
    syncTransportMessagesWhenIdle([]);
  };

  const deleteConversations = async (conversationIds: string[]): Promise<void> => {
    const normalizedConversationIds = Array.from(new Set(
      conversationIds
        .map((conversationId) => conversationId.trim())
        .filter((conversationId) => conversationId.length > 0),
    ));
    if (normalizedConversationIds.length === 0 || isSending() || state.deletingConversations) {
      return;
    }

    state.runtimeError = "";
    state.deletingConversations = true;
    const deletedConversationIds = new Set(normalizedConversationIds);
    const activeConversationId = state.activeConversationId?.trim() ?? "";
    const activeConversationDeleted = activeConversationId.length > 0 && deletedConversationIds.has(activeConversationId);
    const nextActiveConversationId = activeConversationDeleted
      ? state.conversations.find((conversation) => !deletedConversationIds.has(conversation.id))?.id ?? null
      : state.activeConversationId;
    const persistedConversationIds: string[] = [];

    try {
      for (const conversationId of normalizedConversationIds) {
        if (draftConversationIds.has(conversationId)) {
          draftConversationIds.delete(conversationId);
          clearCachedMessages(conversationId);
          continue;
        }
        persistedConversationIds.push(conversationId);
      }
      await Promise.all(persistedConversationIds.map((conversationId) => runtimeApi.deleteConversation(conversationId)));

      state.conversations = state.conversations.filter((conversation) => !deletedConversationIds.has(conversation.id));
      for (const conversationId of deletedConversationIds) {
        clearCachedMessages(conversationId);
      }
      state.activeConversationId = nextActiveConversationId;

      if (!activeConversationDeleted) {
        return;
      }

      if (!nextActiveConversationId) {
        state.visibleMessages = [];
        syncTransportMessagesWhenIdle([]);
        return;
      }

      await selectConversation(nextActiveConversationId);
    } catch (error) {
      state.runtimeError = toDisplayErrorText(error);
      try {
        await refreshConversations();
        if (!state.activeConversationId) {
          state.visibleMessages = [];
          syncTransportMessagesWhenIdle([]);
          return;
        }
        await selectConversation(state.activeConversationId);
      } catch {
        // Keep the original delete error visible if refresh also fails.
      }
    } finally {
      state.deletingConversations = false;
    }
  };

  const deleteActiveConversation = async (): Promise<void> => {
    const conversationId = state.activeConversationId?.trim() ?? "";
    if (!conversationId) {
      return;
    }
    await deleteConversations([conversationId]);
  };

  const submitChat = async (onAfterSend: (() => Promise<void>) | null = null): Promise<void> => {
    const nextMessage = state.input.trim();
    if (!nextMessage || isSending() || state.deletingConversations) {
      return;
    }

    state.input = "";
    state.runtimeError = "";
    const conversationId = ensureActiveConversationId();
    const currentMessages = getCachedMessages(conversationId);
    state.activeConversationId = conversationId;
    state.visibleMessages = currentMessages;
    chat.messages = currentMessages;
    startStreamingMirror(conversationId);

    try {
      await chat.sendMessage({ text: nextMessage });
      if (chat.status === "error" && !hasTerminalAssistantText(chat.messages as UIMessage[])) {
        state.runtimeError = toDisplayErrorText(chat.error);
      }
      setCachedMessages(conversationId, chat.messages as UIMessage[]);
      if (state.activeConversationId === conversationId) {
        state.visibleMessages = chat.messages as UIMessage[];
      }
      await refreshConversations();
      if (onAfterSend) {
        await onAfterSend();
      }
    } catch (error) {
      state.runtimeError = toDisplayErrorText(error);
    } finally {
      if (activeStreamConversationId === conversationId) {
        stopStreamingMirror();
      }
    }
  };

  return {
    chat,
    state,
    isSending,
    isActiveConversationStreaming,
    getActiveConversationChatStatus,
    initialize,
    createNewConversation,
    deleteConversations,
    deleteActiveConversation,
    selectConversation,
    submitChat,
  };
};
