import type {
  GuiActivityEntry,
  GuiConversationView,
  GuiInstanceProfileView,
} from "@trenchclaw/types";
import { createChatMessageId, createInstanceConversationId } from "../../ai/runtime/types/ids";
import type { RuntimeBootstrap } from "../bootstrap";
import { MAX_ACTIVITY_ITEMS } from "./constants";
import type { RuntimeGuiDomainContext } from "./contracts";
import { createGuiApiHandler } from "./router";
import { streamChat } from "./domains/chat";
import type { UIMessage } from "ai";
import { readPersistedActiveInstanceSync } from "../instance-state";

const createMessageId = (): string => createChatMessageId("activity");

export class RuntimeGuiTransport implements RuntimeGuiDomainContext {
  private readonly activity: GuiActivityEntry[] = [];
  private readonly activityListeners = new Set<() => void>();
  private readonly unsubscribers: Array<() => void> = [];
  private activeInstance: GuiInstanceProfileView | null = null;
  private activeChatId: string | null = null;

  constructor(public readonly runtime: RuntimeBootstrap) {
    this.activeInstance = readPersistedActiveInstanceSync();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
  }

  getActiveInstance(): GuiInstanceProfileView | null {
    return this.activeInstance;
  }

  setActiveInstance(instance: GuiInstanceProfileView | null): void {
    this.activeInstance = instance;
  }

  getActiveChatId(): string | null {
    return this.activeChatId;
  }

  setActiveChatId(chatId: string | null): void {
    this.activeChatId = chatId;
  }

  addActivity(source: GuiActivityEntry["source"], summary: string): void {
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

  getActivityEntries(limit: number): GuiActivityEntry[] {
    return this.activity.slice(-limit);
  }

  private toConversationTitle(title: string | undefined, timestamp: number): string {
    const trimmedTitle = title?.trim();
    if (trimmedTitle) {
      return trimmedTitle;
    }
    return new Date(timestamp).toISOString();
  }

  listInstanceConversations(limit = 100): GuiConversationView[] {
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

  async waitForJobResult(jobId: string, waitMs: number): Promise<ReturnType<RuntimeBootstrap["stateStore"]["getJob"]>> {
    const timeoutAt = Date.now() + waitMs;
    const poll = async (): Promise<ReturnType<RuntimeBootstrap["stateStore"]["getJob"]>> => {
      const job = this.runtime.stateStore.getJob(jobId);
      if (job?.lastResult) {
        return job;
      }
      if (Date.now() >= timeoutAt) {
        return job;
      }
      await Bun.sleep(100);
      return poll();
    };

    return poll();
  }

  async streamChat(messages: UIMessage[], input?: { chatId?: string; conversationTitle?: string; abortSignal?: AbortSignal }): Promise<Response> {
    return streamChat(this, messages, input);
  }

  createApiHandler(): (request: Request) => Promise<Response> {
    return createGuiApiHandler(this);
  }
}

export const createRuntimeApiHandler = (runtime: RuntimeBootstrap): ((request: Request) => Promise<Response>) => {
  const transport = new RuntimeGuiTransport(runtime);
  return transport.createApiHandler();
};
