import { mkdirSync } from "node:fs";
import path from "node:path";
import { Queue, Worker, shutdownManager } from "bunqueue/client";

import type {
  ActionContext,
  DispatchResult,
  JobState,
  RoutinePlanner,
  RuntimeEventBus,
  StateStore,
} from "../contracts/types";
import { resolveRequiredActiveInstanceIdSync } from "../../runtime/instance/state";
import { resolveInstanceQueueSqlitePath } from "../../runtime/instance/paths";
import { RUNTIME_STATE_ROOT } from "../../runtime/runtimePaths";
import type { ActionDispatcher } from "./dispatcher";

export interface SchedulerDeps {
  stateStore: StateStore;
  dispatcher: ActionDispatcher;
  eventBus: RuntimeEventBus;
  createContext: (job: JobState) => ActionContext;
  resolveRoutine: (routineName: string) => RoutinePlanner;
}

export interface SchedulerOptions {
  dataPath?: string;
  maxConcurrentJobs?: number;
  queueName?: string;
}

interface QueueJobPayload {
  jobId: string;
  expectedCycle: number;
  enqueuedAt: number;
}

interface QueueDequeueSnapshot {
  queueSize: number;
  queuePosition: number;
}

const DEFAULT_QUEUE_NAME = "trenchclaw-runtime-jobs";
const BUNQUEUE_DATA_PATH_ENV = "DATA_PATH";

export class Scheduler {
  private queue: Queue<QueueJobPayload> | null = null;
  private worker: Worker<QueueJobPayload> | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private queuedCycles = new Map<string, number>();
  private started = false;

  constructor(
    private readonly deps: SchedulerDeps,
    private readonly tickMs = 1000,
    private readonly options: SchedulerOptions = {},
  ) {}

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    const queueName = this.options.queueName ?? DEFAULT_QUEUE_NAME;
    configureEmbeddedBunqueueDataPath(this.options.dataPath);

    this.queue = new Queue<QueueJobPayload>(queueName, {
      embedded: true,
    });
    this.worker = new Worker<QueueJobPayload>(
      queueName,
      async (queuedJob) => this.processQueuedJob(queuedJob.data as QueueJobPayload),
      {
        embedded: true,
        concurrency: Math.max(1, Math.trunc(this.options.maxConcurrentJobs ?? 1)),
      },
    );
    void this.tick().catch((error) => {
      console.error("scheduler:tick_failed", error);
    });
    this.tickInterval = setInterval(() => {
      void this.tick().catch((error) => {
        console.error("scheduler:tick_failed", error);
      });
    }, Math.max(1, Math.trunc(this.tickMs)));
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.started = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.queuedCycles.clear();
    await Promise.all([closeBunqueueResource(this.worker), closeBunqueueResource(this.queue)]);
    shutdownManager();
    this.worker = null;
    this.queue = null;
  }

  async tick(now = Date.now()): Promise<void> {
    if (!this.queue) {
      return;
    }
    const pendingJobs = this.deps
      .stateStore
      .listJobs({ status: "pending" })
      .toSorted(comparePendingJobs)
      .filter((job) => isJobDue(job, now));

    await Promise.all(pendingJobs.map((job) => this.enqueue(job, now)));
  }

  async enqueue(job: JobState, now = Date.now()): Promise<void> {
    if (!this.queue) {
      throw new Error("Scheduler queue is not initialized. Call start() before enqueue().");
    }

    if (!isJobDue(job, now)) {
      return;
    }

    const expectedCycle = job.cyclesCompleted + 1;
    if (this.queuedCycles.get(job.id) === expectedCycle) {
      return;
    }

    await this.queue.add(
      job.routineName,
      {
        jobId: job.id,
        expectedCycle,
        enqueuedAt: Date.now(),
      },
    );
    this.queuedCycles.set(job.id, expectedCycle);
    this.emitQueueEnqueue(job, now);
  }

  private async processQueuedJob(payload: QueueJobPayload): Promise<DispatchResult | { skipped: true; reason: string }> {
    this.queuedCycles.delete(payload.jobId);
    const pendingSnapshot = this.deps.stateStore.listJobs({ status: "pending" }).toSorted(comparePendingJobs);
    const queuePosition = pendingSnapshot.findIndex((entry) => entry.id === payload.jobId) + 1;
    const job = this.deps.stateStore.tryStartJob({
      id: payload.jobId,
      expectedCycle: payload.expectedCycle,
      leaseOwner: "local-runtime",
      leaseExpiresAt: Date.now() + 5 * 60 * 1000,
    });
    if (!job) {
      const latest = this.deps.stateStore.getJob(payload.jobId);
      const expectedCycle = latest ? latest.cyclesCompleted + 1 : payload.expectedCycle;
      return {
        skipped: true,
        reason: latest
          ? `job "${payload.jobId}" could not be claimed (status=${latest.status}, expectedCycle=${expectedCycle}, received=${payload.expectedCycle})`
          : `job "${payload.jobId}" no longer exists`,
      };
    }

    return this.runJob(job, payload, {
      queueSize: pendingSnapshot.length,
      queuePosition: queuePosition > 0 ? queuePosition : 1,
    });
  }

  private async runJob(job: JobState, payload: QueueJobPayload, dequeueSnapshot: QueueDequeueSnapshot): Promise<DispatchResult> {
    const runStartedAt = Date.now();
    this.deps.eventBus.emit("queue:dequeue", {
      jobId: job.id,
      serialNumber: job.serialNumber,
      botId: job.botId,
      routineName: job.routineName,
      queueSize: dequeueSnapshot.queueSize,
      queuePosition: dequeueSnapshot.queuePosition,
      waitMs: Math.max(0, runStartedAt - payload.enqueuedAt),
    });
    this.deps.eventBus.emit("bot:start", {
      botId: job.botId,
      routineName: job.routineName,
    });

    try {
      const ctx = this.deps.createContext(job);
      const planner = this.deps.resolveRoutine(job.routineName);
      const steps = await planner(ctx, job);
      const dispatchResult = await this.deps.dispatcher.dispatchPlan(ctx, steps);

      let finalStatus = determineFinalStatus(job, dispatchResult);
      const completedAt = Date.now();
      const nextRunAt = computeNextRunAt(job, completedAt);

      this.deps.stateStore.updateJobStatus(job.id, finalStatus, {
        lastResult: dispatchResult.results[dispatchResult.results.length - 1],
        lastRunAt: completedAt,
        cyclesCompleted: job.cyclesCompleted + 1,
        nextRunAt,
        lastError: undefined,
      });

      if (finalStatus === "pending") {
        const nextJobState = this.deps.stateStore.getJob(job.id);
        if (!nextJobState) {
          throw new Error(`Job "${job.id}" disappeared after scheduling cycle completion`);
        }

        if (isJobDue(nextJobState, Date.now())) {
          try {
            await this.enqueue(nextJobState);
          } catch (error) {
            finalStatus = "failed";
            this.deps.stateStore.updateJobStatus(job.id, finalStatus, {
              lastError: error instanceof Error ? error.message : String(error),
              nextRunAt: undefined,
            });
          }
        }
      }

      this.deps.eventBus.emit("queue:complete", {
        jobId: job.id,
        serialNumber: job.serialNumber,
        botId: job.botId,
        routineName: job.routineName,
        status: finalStatus,
        durationMs: Math.max(0, Date.now() - runStartedAt),
        cyclesCompleted: job.cyclesCompleted + 1,
      });

      if (finalStatus === "stopped" || finalStatus === "failed") {
        this.deps.eventBus.emit("bot:stop", {
          botId: job.botId,
          reason: finalStatus,
        });
      }

      return dispatchResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.stateStore.updateJobStatus(job.id, "failed", {
        lastError: message,
        lastRunAt: Date.now(),
        nextRunAt: undefined,
      });
      this.deps.eventBus.emit("queue:complete", {
        jobId: job.id,
        serialNumber: job.serialNumber,
        botId: job.botId,
        routineName: job.routineName,
        status: "failed",
        durationMs: Math.max(0, Date.now() - runStartedAt),
        cyclesCompleted: job.cyclesCompleted,
      });
      this.deps.eventBus.emit("bot:stop", {
        botId: job.botId,
        reason: "failed",
      });
      throw error;
    }
  }

  private emitQueueEnqueue(job: JobState, now: number): void {
    const readyJobs = this.deps
      .stateStore
      .listJobs({ status: "pending" })
      .toSorted(comparePendingJobs)
      .filter((entry) => isJobDue(entry, now));
    const queuePosition = readyJobs.findIndex((entry) => entry.id === job.id) + 1;

    this.deps.eventBus.emit("queue:enqueue", {
      jobId: job.id,
      serialNumber: job.serialNumber,
      botId: job.botId,
      routineName: job.routineName,
      queueSize: readyJobs.length,
      queuePosition: queuePosition > 0 ? queuePosition : readyJobs.length,
      nextRunAt: job.nextRunAt,
    });
  }
}

function configureEmbeddedBunqueueDataPath(dataPath: string | undefined): void {
  const resolvedPath = resolveQueueDataPath(dataPath);
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  if (process.env[BUNQUEUE_DATA_PATH_ENV] && process.env[BUNQUEUE_DATA_PATH_ENV] !== resolvedPath) {
    shutdownManager();
  }
  process.env[BUNQUEUE_DATA_PATH_ENV] = resolvedPath;
}

export function resolveQueueDataPath(dataPath: string | undefined): string {
  const normalized = dataPath?.trim();
  if (!normalized) {
    return resolveInstanceQueueSqlitePath(
      resolveRequiredActiveInstanceIdSync(
        "No active instance selected. Queue storage is instance-scoped. Sign in before starting the scheduler.",
      ),
    );
  }
  return path.isAbsolute(normalized) ? normalized : path.resolve(RUNTIME_STATE_ROOT, normalized);
}

async function closeBunqueueResource(resource: unknown): Promise<void> {
  const closable = resource as { close?: () => Promise<unknown> | unknown } | null;
  if (closable?.close) {
    await closable.close();
  }
}

function comparePendingJobs(a: JobState, b: JobState): number {
  const nextRunA = typeof a.nextRunAt === "number" ? a.nextRunAt : Number.MAX_SAFE_INTEGER;
  const nextRunB = typeof b.nextRunAt === "number" ? b.nextRunAt : Number.MAX_SAFE_INTEGER;
  if (nextRunA !== nextRunB) {
    return nextRunA - nextRunB;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  return a.id.localeCompare(b.id);
}

function determineFinalStatus(job: JobState, result: DispatchResult): "pending" | "failed" | "stopped" {
  const failed = result.results.some((entry) => !entry.ok && !entry.retryable);
  if (failed) {
    return "failed";
  }

  if (job.totalCycles !== undefined && job.cyclesCompleted + 1 >= job.totalCycles) {
    return "stopped";
  }

  return "pending";
}

function computeNextRunAt(job: JobState, from: number): number | undefined {
  const intervalMs = Number(job.config.intervalMs);
  if (Number.isFinite(intervalMs) && intervalMs > 0) {
    return from + intervalMs;
  }
  return undefined;
}

function isJobDue(job: JobState, now: number): boolean {
  return typeof job.nextRunAt !== "number" || job.nextRunAt <= now;
}
