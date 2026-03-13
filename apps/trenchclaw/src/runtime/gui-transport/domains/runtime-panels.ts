import type {
  GuiActivityResponse,
  GuiBootstrapResponse,
  GuiScheduleJobView,
  GuiScheduleResponse,
  GuiQueueJobView,
  GuiQueueResponse,
} from "@trenchclaw/types";
import type { RuntimeEventName } from "../../../ai/runtime/types/events";
import { resolveLlmProviderConfig } from "../../../ai/llm/config";
import { ACTIVE_JOB_STATUSES, GUI_QUEUE_INCLUDE_HISTORY } from "../constants";
import { CORS_HEADERS } from "../constants";
import type { RuntimeGuiDomainContext } from "../contracts";

export const mapJobToView = (job: ReturnType<RuntimeGuiDomainContext["runtime"]["stateStore"]["listJobs"]>[number]): GuiQueueJobView => ({
  id: job.id,
  serialNumber: job.serialNumber ?? null,
  botId: job.botId,
  routineName: job.routineName,
  status: job.status,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  nextRunAt: typeof job.nextRunAt === "number" ? job.nextRunAt : null,
  cyclesCompleted: job.cyclesCompleted,
});

const toIntervalMs = (job: ReturnType<RuntimeGuiDomainContext["runtime"]["stateStore"]["listJobs"]>[number]): number | null => {
  const raw = job.config.intervalMs;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
};

const isRecurringJob = (job: ReturnType<RuntimeGuiDomainContext["runtime"]["stateStore"]["listJobs"]>[number]): boolean => {
  const intervalMs = toIntervalMs(job);
  if (intervalMs !== null) {
    return true;
  }
  if (job.totalCycles === undefined) {
    return true;
  }
  return job.totalCycles > 1;
};

const hasUpcomingRun = (
  job: ReturnType<RuntimeGuiDomainContext["runtime"]["stateStore"]["listJobs"]>[number],
  now = Date.now(),
): boolean => typeof job.nextRunAt === "number" && job.nextRunAt > now;

const isScheduledJob = (job: ReturnType<RuntimeGuiDomainContext["runtime"]["stateStore"]["listJobs"]>[number]): boolean =>
  ACTIVE_JOB_STATUSES.has(job.status)
  && (job.status === "paused" || hasUpcomingRun(job));

const mapJobToScheduleView = (
  job: ReturnType<RuntimeGuiDomainContext["runtime"]["stateStore"]["listJobs"]>[number],
): GuiScheduleJobView => ({
  id: job.id,
  serialNumber: job.serialNumber ?? null,
  botId: job.botId,
  routineName: job.routineName,
  status: job.status,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  nextRunAt: typeof job.nextRunAt === "number" ? job.nextRunAt : null,
  intervalMs: toIntervalMs(job),
  cyclesCompleted: job.cyclesCompleted,
  totalCycles: job.totalCycles ?? null,
  recurring: isRecurringJob(job),
});

const compareQueueJobsChronologically = (
  a: ReturnType<RuntimeGuiDomainContext["runtime"]["stateStore"]["listJobs"]>[number],
  b: ReturnType<RuntimeGuiDomainContext["runtime"]["stateStore"]["listJobs"]>[number],
): number => {
  const effectiveTimeA = typeof a.nextRunAt === "number" ? a.nextRunAt : a.createdAt;
  const effectiveTimeB = typeof b.nextRunAt === "number" ? b.nextRunAt : b.createdAt;

  if (effectiveTimeA !== effectiveTimeB) {
    return effectiveTimeA - effectiveTimeB;
  }

  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }

  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt - b.updatedAt;
  }

  return a.id.localeCompare(b.id);
};

const compareScheduleJobsChronologically = (
  a: ReturnType<RuntimeGuiDomainContext["runtime"]["stateStore"]["listJobs"]>[number],
  b: ReturnType<RuntimeGuiDomainContext["runtime"]["stateStore"]["listJobs"]>[number],
): number => {
  const nextRunA = typeof a.nextRunAt === "number" ? a.nextRunAt : Number.MAX_SAFE_INTEGER;
  const nextRunB = typeof b.nextRunAt === "number" ? b.nextRunAt : Number.MAX_SAFE_INTEGER;

  if (nextRunA !== nextRunB) {
    return nextRunA - nextRunB;
  }

  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }

  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt - b.updatedAt;
  }

  return a.id.localeCompare(b.id);
};

export const getBootstrap = async (context: RuntimeGuiDomainContext): Promise<GuiBootstrapResponse> => {
  const llmConfig = await resolveLlmProviderConfig();
  return {
    profile: context.runtime.settings.profile,
    llmEnabled: llmConfig !== null,
    activeInstance: context.getActiveInstance(),
    runtime: context.runtime.describe(),
  };
};

export const getQueue = (context: RuntimeGuiDomainContext): GuiQueueResponse => {
  const jobs = context.runtime.stateStore
    .listJobs()
    .filter((job) => GUI_QUEUE_INCLUDE_HISTORY || ACTIVE_JOB_STATUSES.has(job.status))
    .toSorted(compareQueueJobsChronologically)
    .map(mapJobToView);
  return { jobs };
};

export const getSchedule = (context: RuntimeGuiDomainContext): GuiScheduleResponse => {
  const jobs = context.runtime.stateStore
    .listJobs()
    .filter((job) => isScheduledJob(job))
    .toSorted(compareScheduleJobsChronologically)
    .map(mapJobToScheduleView);
  return { jobs };
};

export const getActivity = (context: RuntimeGuiDomainContext, limit = 100): GuiActivityResponse => {
  const normalizedLimit = Math.max(1, Math.trunc(limit));
  return {
    entries: context.getActivityEntries(normalizedLimit),
  };
};

const EVENT_STREAM_HEADERS: HeadersInit = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

const SSE_RETRY_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 15_000;

export const streamRuntimeEvents = (context: RuntimeGuiDomainContext, signal?: AbortSignal): Response => {
  const encoder = new TextEncoder();
  const eventTypes: RuntimeEventName[] = ["queue:enqueue", "queue:dequeue", "queue:complete"];

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const unsubscribers: Array<() => void> = [];

      const closeStream = (): void => {
        if (closed) {
          return;
        }
        closed = true;
        for (const unsubscribe of unsubscribers) {
          unsubscribe();
        }
        controller.close();
      };

      const pushEvent = (event: "bootstrap" | "queue" | "schedule" | "activity", payload: unknown): void => {
        if (closed) {
          return;
        }
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };

      const pushSnapshot = async (): Promise<void> => {
        controller.enqueue(encoder.encode(`retry: ${SSE_RETRY_MS}\n\n`));
        const bootstrap = await getBootstrap(context);
        pushEvent("bootstrap", bootstrap);
        pushEvent("queue", getQueue(context));
        pushEvent("schedule", getSchedule(context));
        pushEvent("activity", getActivity(context));
      };

      const heartbeat = setInterval(() => {
        if (closed) {
          return;
        }
        controller.enqueue(encoder.encode(`: keep-alive ${Date.now()}\n\n`));
      }, HEARTBEAT_INTERVAL_MS);
      unsubscribers.push(() => clearInterval(heartbeat));

      for (const eventType of eventTypes) {
        unsubscribers.push(
          context.runtime.eventBus.on(eventType, () => {
            pushEvent("queue", getQueue(context));
            pushEvent("schedule", getSchedule(context));
            pushEvent("activity", getActivity(context));
          }),
        );
      }

      if (signal) {
        if (signal.aborted) {
          closeStream();
          return;
        }
        const onAbort = () => closeStream();
        signal.addEventListener("abort", onAbort, { once: true });
        unsubscribers.push(() => signal.removeEventListener("abort", onAbort));
      }

      void pushSnapshot().catch(() => {
        closeStream();
      });
    },
    cancel() {
      // Cleanup is handled by abort listeners and unsubscriber callbacks.
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      ...EVENT_STREAM_HEADERS,
    },
  });
};
