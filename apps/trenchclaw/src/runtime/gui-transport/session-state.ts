import type {
  RuntimeApiActivityEntry,
  RuntimeApiConversationView,
  RuntimeApiInstanceProfileView,
} from "@trenchclaw/types";
import { createChatMessageId, createInstanceConversationId } from "../../ai/runtime/types/ids";
import type { RuntimeBootstrap } from "../bootstrap";
import { readPersistedActiveInstanceSync } from "../instance-state";
import { MAX_ACTIVITY_ITEMS } from "./constants";

const createMessageId = (): string => createChatMessageId("activity");

export class RuntimeSurfaceSessionState {
  private readonly activity: RuntimeApiActivityEntry[] = [];
  private readonly activityListeners = new Set<() => void>();
  private activeInstance: RuntimeApiInstanceProfileView | null = null;
  private activeChatId: string | null = null;

  constructor(private readonly runtime: RuntimeBootstrap) {
    this.activeInstance = readPersistedActiveInstanceSync();
  }

  getActiveInstance(): RuntimeApiInstanceProfileView | null {
    return this.activeInstance;
  }

  setActiveInstance(instance: RuntimeApiInstanceProfileView | null): void {
    this.activeInstance = instance;
  }

  getActiveChatId(): string | null {
    return this.activeChatId;
  }

  setActiveChatId(chatId: string | null): void {
    this.activeChatId = chatId;
  }

  addActivity(source: RuntimeApiActivityEntry["source"], summary: string): void {
    this.activity.push({
      id: createMessageId(),
      source,
      summary,
      timestamp: Date.now(),
    });
    if (this.activity.length > MAX_ACTIVITY_ITEMS) {
      this.activity.splice(0, this.activity.length - MAX_ACTIVITY_ITEMS);
    }
    for (const listener of this.activityListeners) {
      listener();
    }
  }

  onActivity(listener: () => void): () => void {
    this.activityListeners.add(listener);
    return () => {
      this.activityListeners.delete(listener);
    };
  }

  getActivityEntries(limit: number): RuntimeApiActivityEntry[] {
    return this.activity.slice(-limit);
  }

  listInstanceConversations(limit = 100): RuntimeApiConversationView[] {
    const normalizedLimit = Math.max(1, Math.trunc(limit));
    const activeInstanceId = this.activeInstance?.localInstanceId;

    return this.runtime.stateStore
      .listConversations(normalizedLimit * 2)
      .filter((conversation) => !activeInstanceId || !conversation.sessionId || conversation.sessionId === activeInstanceId)
      .slice(0, normalizedLimit)
      .map((conversation) => ({
        id: conversation.id,
        title: this.toConversationTitle(conversation.title, conversation.createdAt),
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      }));
  }

  resolveDefaultChatId(): string {
    if (this.activeChatId) {
      return this.activeChatId;
    }

    const recentConversation = this.listInstanceConversations(1)[0];
    if (recentConversation) {
      this.activeChatId = recentConversation.id;
      return this.activeChatId;
    }

    if (this.activeInstance) {
      this.activeChatId = createInstanceConversationId(this.activeInstance.localInstanceId);
      return this.activeChatId;
    }
    this.activeChatId = createInstanceConversationId("global");
    return this.activeChatId;
  }

  private toConversationTitle(title: string | undefined, timestamp: number): string {
    const trimmedTitle = title?.trim();
    if (trimmedTitle) {
      return trimmedTitle;
    }
    return new Date(timestamp).toISOString();
  }
}
