import type {
  RuntimeApiActivityEntry,
} from "@trenchclaw/types";
import type { RuntimeEvent, RuntimeEventName } from "../../ai";
import type { RuntimeBootstrap } from "../bootstrap";
import type { RuntimeTransportContext } from "./contracts";
import { createRuntimeTransportRequestHandler } from "./router";
import { RuntimeTransportSessionState } from "./session-state";
import { streamChat } from "./domains/chat";
import type { UIMessage } from "ai";
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

export class RuntimeTransport implements RuntimeTransportContext {
  private readonly unsubscribers: Array<() => void> = [];
  private readonly session: RuntimeTransportSessionState;

  constructor(public readonly runtime: RuntimeBootstrap) {
    this.session = new RuntimeTransportSessionState(runtime);
    this.attachRuntimeActivitySubscriptions();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
  }

  getActiveInstance() {
    return this.session.getActiveInstance();
  }

  setActiveInstance(instance: ReturnType<RuntimeTransportSessionState["getActiveInstance"]>): void {
    this.session.setActiveInstance(instance);
  }

  getActiveChatId(): string | null {
    return this.session.getActiveChatId();
  }

  setActiveChatId(chatId: string | null): void {
    this.session.setActiveChatId(chatId);
  }

  addActivity(source: RuntimeApiActivityEntry["source"], summary: string): void {
    this.session.addActivity(source, summary);
  }

  onActivity(listener: () => void): () => void {
    return this.session.onActivity(listener);
  }

  getActivityEntries(limit: number) {
    return this.session.getActivityEntries(limit);
  }

  private subscribeToRuntimeEvent<K extends RuntimeEventName>(
    type: K,
    source: RuntimeApiActivityEntry["source"],
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

  listInstanceConversations(limit = 100) {
    return this.session.listInstanceConversations(limit);
  }

  resolveDefaultChatId(): string {
    return this.session.resolveDefaultChatId();
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

  async streamChat(
    messages: UIMessage[],
    input?: { chatId?: string; conversationTitle?: string; lane?: import("../../ai/gateway").GatewayLane; abortSignal?: AbortSignal },
  ): Promise<Response> {
    return streamChat(this, messages, input);
  }

  createApiHandler(): (request: Request) => Promise<Response> {
    return createRuntimeTransportRequestHandler(this);
  }
}

export const createRuntimeTransportHandler = (runtime: RuntimeBootstrap): ((request: Request) => Promise<Response>) => {
  const transport = new RuntimeTransport(runtime);
  return transport.createApiHandler();
};

export const createRuntimeApiHandler = (runtime: RuntimeBootstrap): ((request: Request) => Promise<Response>) => {
  return createRuntimeTransportHandler(runtime);
};
