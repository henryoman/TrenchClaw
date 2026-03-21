import type {
  GuiActivityEntry,
  GuiConversationView,
  GuiInstanceProfileView,
} from "@trenchclaw/types";
import type { RuntimeEvent, RuntimeEventName } from "../../ai";
import { createChatMessageId, createInstanceConversationId } from "../../ai/runtime/types/ids";
import type { RuntimeBootstrap } from "../bootstrap";
import { MAX_ACTIVITY_ITEMS } from "./constants";
import type { RuntimeGuiDomainContext } from "./contracts";
import { createGuiApiHandler } from "./router";
import { streamChat } from "./domains/chat";
import type { UIMessage } from "ai";
import { readPersistedActiveInstanceSync } from "../instance-state";

const createMessageId = (): string => createChatMessageId("activity");
const MAX_ACTIVITY_PREVIEW_CHARS = 120;

const truncateActivityText = (value: string, maxLength = MAX_ACTIVITY_PREVIEW_CHARS): string =>
  value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…` : value;

const normalizeActivityText = (value: string | undefined, maxLength = MAX_ACTIVITY_PREVIEW_CHARS): string | null => {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? truncateActivityText(normalized, maxLength) : null;
};

const summarizeEndpoint = (value: string): string => {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname}${pathname}`;
  } catch {
    return normalizeActivityText(value, 72) ?? value;
  }
};

const summarizeSignature = (value: string): string =>
  value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-6)}` : value;

export class RuntimeGuiTransport implements RuntimeGuiDomainContext {
  private readonly activity: GuiActivityEntry[] = [];
  private readonly activityListeners = new Set<() => void>();
  private readonly unsubscribers: Array<() => void> = [];
  private activeInstance: GuiInstanceProfileView | null = null;
  private activeChatId: string | null = null;

  constructor(public readonly runtime: RuntimeBootstrap) {
    this.activeInstance = readPersistedActiveInstanceSync();
    this.attachRuntimeActivitySubscriptions();
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

  private subscribeToRuntimeEvent<K extends RuntimeEventName>(
    type: K,
    source: GuiActivityEntry["source"],
    formatSummary: (event: RuntimeEvent<K>) => string | null,
  ): void {
    this.unsubscribers.push(
      this.runtime.eventBus.on(type, (event) => {
        const summary = formatSummary(event);
        if (summary) {
          this.addActivity(source, summary);
        }
      }),
    );
  }

  private attachRuntimeActivitySubscriptions(): void {
    this.subscribeToRuntimeEvent("action:start", "runtime", (event) => {
      const inputSummary = normalizeActivityText(event.payload.inputSummary, 96);
      return inputSummary
        ? `Started ${event.payload.actionName}: ${inputSummary}`
        : `Started ${event.payload.actionName}`;
    });
    this.subscribeToRuntimeEvent("action:success", "runtime", (event) => (
      event.payload.txSignature
        ? `Completed ${event.payload.actionName} (${summarizeSignature(event.payload.txSignature)})`
        : `Completed ${event.payload.actionName}`
    ));
    this.subscribeToRuntimeEvent("action:fail", "runtime", (event) => {
      const errorMessage = normalizeActivityText(event.payload.error, 96) ?? "Unknown error";
      return `Failed ${event.payload.actionName}: ${errorMessage}`;
    });
    this.subscribeToRuntimeEvent("action:retry", "runtime", (event) => (
      `Retrying ${event.payload.actionName} (attempt ${event.payload.attempt})`
    ));
    this.subscribeToRuntimeEvent("bot:start", "runtime", (event) => (
      `Started ${event.payload.routineName} for ${event.payload.botId}`
    ));
    this.subscribeToRuntimeEvent("bot:pause", "runtime", (event) => {
      const reason = normalizeActivityText(event.payload.reason, 72);
      return reason ? `Paused ${event.payload.botId} (${reason})` : `Paused ${event.payload.botId}`;
    });
    this.subscribeToRuntimeEvent("bot:stop", "runtime", (event) => {
      const reason = normalizeActivityText(event.payload.reason, 72);
      return reason ? `Stopped ${event.payload.botId} (${reason})` : `Stopped ${event.payload.botId}`;
    });
    this.subscribeToRuntimeEvent("policy:block", "runtime", (event) => {
      const reason = normalizeActivityText(event.payload.reason, 96) ?? "Policy blocked";
      return `Blocked ${event.payload.actionName}: ${reason}`;
    });
    this.subscribeToRuntimeEvent("rpc:failover", "runtime", (event) => {
      const reason = normalizeActivityText(event.payload.reason, 72);
      return reason
        ? `RPC failover to ${summarizeEndpoint(event.payload.toEndpoint)}: ${reason}`
        : `RPC failover to ${summarizeEndpoint(event.payload.toEndpoint)}`;
    });
    this.subscribeToRuntimeEvent("queue:enqueue", "queue", (event) => (
      `Queued ${event.payload.routineName} for ${event.payload.botId} (${event.payload.queuePosition}/${event.payload.queueSize})`
    ));
    this.subscribeToRuntimeEvent("queue:dequeue", "queue", (event) => (
      `Running ${event.payload.routineName} for ${event.payload.botId}`
    ));
    this.subscribeToRuntimeEvent("queue:complete", "queue", (event) => {
      if (event.payload.status === "pending") {
        return `Finished ${event.payload.routineName} for ${event.payload.botId} (next cycle pending)`;
      }
      return `Finished ${event.payload.routineName} for ${event.payload.botId} (${event.payload.status})`;
    });
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
