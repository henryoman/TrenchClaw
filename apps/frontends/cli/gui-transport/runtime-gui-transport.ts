import type {
  GuiActivityEntry,
  GuiConversationView,
  GuiInstanceProfileView,
} from "@trenchclaw/types";
import type { RuntimeBootstrap } from "../../../trenchclaw/src/runtime/bootstrap";
import { MAX_ACTIVITY_ITEMS } from "./constants";
import type { RuntimeGuiDomainContext } from "./contracts";
import { createGuiApiHandler } from "./router";
import { streamChat } from "./domains/chat";
import { runDispatcherQueueTest } from "./domains/tests";
import type { UIMessage } from "ai";
import type { DispatcherTestRequest } from "./parsers";

const createMessageId = (): string => crypto.randomUUID();

export class RuntimeGuiTransport implements RuntimeGuiDomainContext {
  private readonly activity: GuiActivityEntry[] = [];
  private readonly unsubscribers: Array<() => void> = [];
  private activeInstance: GuiInstanceProfileView | null = null;
  private activeChatId: string | null = null;

  constructor(public readonly runtime: RuntimeBootstrap) {
    this.addActivity("runtime", "Runtime transport initialized");

    this.unsubscribers.push(
      this.runtime.eventBus.on("queue:enqueue", (event) => {
        this.addActivity(
          "queue",
          `Queued ${event.payload.routineName} for ${event.payload.botId} (#${event.payload.queuePosition})`,
        );
      }),
    );

    this.unsubscribers.push(
      this.runtime.eventBus.on("queue:dequeue", (event) => {
        this.addActivity("queue", `Started ${event.payload.routineName} for ${event.payload.botId}`);
      }),
    );

    this.unsubscribers.push(
      this.runtime.eventBus.on("queue:complete", (event) => {
        this.addActivity(
          "queue",
          `Confirmed ${event.payload.routineName} for ${event.payload.botId} (${event.payload.status})`,
        );
      }),
    );
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
    this.activity.unshift({
      id: createMessageId(),
      source,
      summary,
      timestamp: Date.now(),
    });
    this.activity.splice(MAX_ACTIVITY_ITEMS);
  }

  getActivityEntries(limit: number): GuiActivityEntry[] {
    return this.activity.slice(0, limit);
  }

  private toConversationTitle(timestamp: number): string {
    return new Date(timestamp).toISOString();
  }

  listInstanceConversations(limit = 100): GuiConversationView[] {
    const normalizedLimit = Math.max(1, Math.trunc(limit));
    const activeInstanceId = this.activeInstance?.localInstanceId;

    return this.runtime.stateStore
      .listConversations(normalizedLimit * 2)
      .filter((conversation) => !activeInstanceId || conversation.sessionId === activeInstanceId)
      .slice(0, normalizedLimit)
      .map((conversation) => ({
        id: conversation.id,
        title: this.toConversationTitle(conversation.createdAt),
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
      this.activeChatId = `instance-${this.activeInstance.localInstanceId}-${crypto.randomUUID()}`;
      return this.activeChatId;
    }
    this.activeChatId = `chat-${crypto.randomUUID()}`;
    return this.activeChatId;
  }

  async waitForJobResult(jobId: string, waitMs: number): Promise<ReturnType<RuntimeBootstrap["stateStore"]["getJob"]>> {
    const timeoutAt = Date.now() + waitMs;
    let job = this.runtime.stateStore.getJob(jobId);
    while (Date.now() < timeoutAt) {
      if (job?.lastResult) {
        return job;
      }
      await Bun.sleep(100);
      job = this.runtime.stateStore.getJob(jobId);
    }
    return job;
  }

  async streamChat(messages: UIMessage[], input?: { chatId?: string; conversationTitle?: string }): Promise<Response> {
    return streamChat(this, messages, input);
  }

  async runDispatcherQueueTest(input: DispatcherTestRequest): Promise<{
    jobId: string;
    completed: boolean;
    status: string;
    result: unknown;
  }> {
    return runDispatcherQueueTest(this, input);
  }

  createApiHandler(): (request: Request) => Promise<Response> {
    return createGuiApiHandler(this);
  }
}

export const createWebGuiApiHandler = (runtime: RuntimeBootstrap): ((request: Request) => Promise<Response>) => {
  const transport = new RuntimeGuiTransport(runtime);
  return transport.createApiHandler();
};
