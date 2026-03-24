import { createChatMessageId, createRuntimeConversationId } from "../../ai/contracts/types/ids";
import type { StateStore } from "../../ai/contracts/types/state";

export interface PersistRuntimeNoticeInput {
  stateStore: StateStore;
  instanceId?: string | null;
  content: string;
  kind?: string;
  title?: string;
  dedupe?: boolean;
}

const toTrimmedText = (value: string): string => value.trim();

export const persistRuntimeNotice = (input: PersistRuntimeNoticeInput): boolean => {
  const content = toTrimmedText(input.content);
  if (!content) {
    return false;
  }

  const now = Date.now();
  const conversationId = createRuntimeConversationId(input.instanceId ?? undefined);
  const existingConversation = input.stateStore.getConversation(conversationId);
  const kind = input.kind ?? "job-notice";
  const relatedConversationId =
    input.stateStore
      .listConversations(25)
      .filter(
        (conversation) =>
          conversation.id !== conversationId
          && (!input.instanceId || conversation.sessionId === input.instanceId),
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id ?? null;

  if (input.dedupe !== false) {
    const latestMessage = input.stateStore.listChatMessages(conversationId, 5).at(-1);
    if (
      latestMessage?.role === "system"
      && latestMessage.content === content
      && latestMessage.metadata?.kind === kind
    ) {
      return false;
    }
  }

  input.stateStore.saveConversation({
    id: conversationId,
    sessionId: input.instanceId ?? existingConversation?.sessionId,
    title: existingConversation?.title ?? input.title ?? "Runtime notices",
    summary: existingConversation?.summary,
    createdAt: existingConversation?.createdAt ?? now,
    updatedAt: now,
  });

  input.stateStore.saveChatMessage({
    id: createChatMessageId("runtime"),
    conversationId,
    role: "system",
    content,
    metadata: {
      source: "runtime",
      kind,
    },
    createdAt: now,
  });

  if (relatedConversationId) {
    const relatedConversation = input.stateStore.getConversation(relatedConversationId);
    const relatedLatestMessage = input.stateStore.listChatMessages(relatedConversationId, 5).at(-1);
    if (
      !(
        input.dedupe !== false
        && relatedLatestMessage?.role === "system"
        && relatedLatestMessage.content === content
        && relatedLatestMessage.metadata?.kind === kind
      )
    ) {
      input.stateStore.saveConversation({
        id: relatedConversationId,
        sessionId: relatedConversation?.sessionId,
        title: relatedConversation?.title,
        summary: relatedConversation?.summary,
        createdAt: relatedConversation?.createdAt ?? now,
        updatedAt: now,
      });
      input.stateStore.saveChatMessage({
        id: createChatMessageId("runtime"),
        conversationId: relatedConversationId,
        role: "system",
        content,
        metadata: {
          source: "runtime",
          kind,
        },
        createdAt: now,
      });
    }
  }

  return true;
};
