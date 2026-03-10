import { Chat } from "@ai-sdk/svelte";
import { DefaultChatTransport } from "ai";
import type { GuiConversationMessageView, GuiConversationView } from "@trenchclaw/types";
import type { UIMessage } from "ai";
import { CHAT_API_PATH, DEFAULT_CHAT_ERROR } from "../../config/app-config";
import { runtimeApi, toRuntimeUrl } from "../../runtime-api";

interface ChatUiState {
  input: string;
  sending: boolean;
  activeConversationId: string | null;
  conversations: GuiConversationView[];
}

const toTimestampTitle = (unixMs: number): string => new Date(unixMs).toISOString();

const toDisplayErrorText = (rawErrorText: string): string =>
  rawErrorText.includes("User not found")
    ? "Your AI provider key is invalid. Update it in AI settings."
    : rawErrorText;

const hasTerminalAssistantText = (messages: UIMessage[]): boolean => {
  const lastMessage = messages.at(-1);
  if (!lastMessage || lastMessage.role !== "assistant") {
    return false;
  }
  return lastMessage.parts.some(
    (part) => part.type === "text" && typeof part.text === "string" && part.text.trim().length > 0,
  );
};

export const createChatController = () => {
  let manuallySending = $state(false);
  let submitInFlight = false;
  const state = $state<ChatUiState>({
    input: "",
    sending: false,
    activeConversationId: null,
    conversations: [],
  });

  const toConversationView = (conversation: GuiConversationView): GuiConversationView => ({
    ...conversation,
    title: toTimestampTitle(conversation.createdAt),
  });

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
        title: toTimestampTitle(now),
        createdAt: now,
        updatedAt: now,
      },
      ...state.conversations,
    ];
    return conversationId;
  };

  const toUiMessages = (messages: GuiConversationMessageView[]) =>
    normalizeUiMessages(
      messages
        .filter((message): message is GuiConversationMessageView & { role: "assistant" | "system" | "user" } => message.role !== "tool")
        .map((message) => ({
          id: message.id,
          role: message.role,
          parts: [
            {
              type: "text" as const,
              text: message.content,
            },
          ],
        })),
    );

  const normalizeUiMessages = (messages: UIMessage[]): UIMessage[] => {
    const normalized: UIMessage[] = [];

    for (const message of messages) {
      const role = message.role;
      if (role !== "system" && role !== "user" && role !== "assistant") {
        continue;
      }

      const textFromParts = message.parts
        .map((part) => {
          if (part.type === "text") {
            return part.text ?? "";
          }

          if ("errorText" in part && typeof part.errorText === "string") {
            return `Something went wrong: ${part.errorText}`;
          }

          return "";
        })
        .join("\n")
        .trim();

      if (!textFromParts) {
        continue;
      }

      const id = message.id?.trim() ? message.id.trim() : `msg-${crypto.randomUUID()}`;
      normalized.push({
        id,
        role,
        parts: [{ type: "text", text: textFromParts }],
      });
    }

    return normalized;
  };

  const appendAssistantRuntimeError = (rawErrorText: string): void => {
    const errorText = toDisplayErrorText(rawErrorText);
    console.error(errorText);
    chat.messages = normalizeUiMessages([
      ...(chat.messages as UIMessage[]),
      {
        id: `msg-${crypto.randomUUID()}`,
        role: "assistant",
        parts: [{ type: "text", text: `Something went wrong: ${errorText}` }],
      },
    ]);
  };

  const chat = new Chat({
    transport: new DefaultChatTransport({
      api: toRuntimeUrl(CHAT_API_PATH),
      prepareSendMessagesRequest: ({ id, messages, body }) => {
        const chatId = ensureActiveConversationId();
        const activeConversation = state.conversations.find((conversation) => conversation.id === chatId);
        return {
          body: {
            id,
            messages,
            ...body,
            chatId,
            conversationTitle: activeConversation?.title ?? toTimestampTitle(Date.now()),
          },
        };
      },
    }),
  });

  const isSending = (): boolean =>
    state.sending || manuallySending || submitInFlight || chat.status === "submitted" || chat.status === "streaming";

  const refreshConversations = async (): Promise<void> => {
    const response = await runtimeApi.conversations();
    state.conversations = response.conversations.map(toConversationView);
    if (!state.activeConversationId && state.conversations[0]) {
      state.activeConversationId = state.conversations[0].id;
    }
  };

  const selectConversation = async (conversationId: string): Promise<void> => {
    const nextConversationId = conversationId.trim();
    if (!nextConversationId) {
      return;
    }

    const response = await runtimeApi.conversationMessages(nextConversationId);
    state.activeConversationId = nextConversationId;
    chat.messages = toUiMessages(response.messages);
  };

  const initialize = async (): Promise<void> => {
    await refreshConversations();
    if (!state.activeConversationId) {
      chat.messages = [];
      return;
    }

    await selectConversation(state.activeConversationId);
  };

  const createNewConversation = (): void => {
    const now = Date.now();
    const conversationId = `chat-${crypto.randomUUID()}`;
    state.activeConversationId = conversationId;
    state.conversations = [
      {
        id: conversationId,
        title: toTimestampTitle(now),
        createdAt: now,
        updatedAt: now,
      },
      ...state.conversations.filter((conversation) => conversation.id !== conversationId),
    ];
    chat.messages = [];
  };

  const submitChat = async (onAfterSend: (() => Promise<void>) | null = null): Promise<void> => {
    const nextMessage = state.input.trim();
    if (!nextMessage || isSending() || submitInFlight) {
      return;
    }

    submitInFlight = true;
    state.input = "";
    ensureActiveConversationId();
    state.sending = true;
    manuallySending = true;

    try {
      chat.messages = normalizeUiMessages(chat.messages as UIMessage[]);
      await chat.sendMessage({ text: nextMessage });
      if (chat.status === "error" && !hasTerminalAssistantText(chat.messages as UIMessage[])) {
        const rawErrorText = chat.error?.message || DEFAULT_CHAT_ERROR;
        appendAssistantRuntimeError(rawErrorText);
        try {
          await runtimeApi.reportClientError({
            source: "gui-chat",
            message: toDisplayErrorText(rawErrorText),
            metadata: {
              chatStatus: chat.status,
              conversationId: state.activeConversationId,
            },
          });
        } catch {
          // Best effort only; keep UI responsive even when runtime cannot accept error telemetry.
        }
      }
      await refreshConversations();
      if (onAfterSend) {
        await onAfterSend();
      }
    } catch (error) {
      const rawErrorText = error instanceof Error ? error.message : DEFAULT_CHAT_ERROR;
      appendAssistantRuntimeError(rawErrorText);
      try {
        await runtimeApi.reportClientError({
          source: "gui-chat",
          message: toDisplayErrorText(rawErrorText),
          metadata: {
            chatStatus: chat.status,
            conversationId: state.activeConversationId,
          },
        });
      } catch {
        // Best effort only; keep UI responsive even when runtime cannot accept error telemetry.
      }
    } finally {
      state.sending = false;
      manuallySending = false;
      submitInFlight = false;
    }
  };

  return {
    chat,
    state,
    isSending,
    initialize,
    createNewConversation,
    selectConversation,
    submitChat,
  };
};
