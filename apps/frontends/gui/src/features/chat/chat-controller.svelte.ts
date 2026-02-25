import { Chat } from "@ai-sdk/svelte";
import { DefaultChatTransport } from "ai";
import { CHAT_API_PATH, DEFAULT_CHAT_ERROR } from "../../config/app-config";
import { toRuntimeUrl } from "../../runtime-api";

interface ChatUiState {
  input: string;
}

export const createChatController = () => {
  const state = $state<ChatUiState>({
    input: "",
  });

  const chat = new Chat({
    transport: new DefaultChatTransport({
      api: toRuntimeUrl(CHAT_API_PATH),
    }),
  });

  const isSending = (): boolean => chat.status === "streaming" || chat.status === "submitted";

  const submitChat = async (onAfterSend: () => Promise<void>): Promise<void> => {
    const nextMessage = state.input.trim();
    if (!nextMessage || isSending()) {
      return;
    }

    state.input = "";

    try {
      await chat.sendMessage({ text: nextMessage });
      await onAfterSend();
    } catch (error) {
      const errorText = error instanceof Error ? error.message : DEFAULT_CHAT_ERROR;
      console.error(errorText);
    }
  };

  return {
    chat,
    state,
    isSending,
    submitChat,
  };
};
