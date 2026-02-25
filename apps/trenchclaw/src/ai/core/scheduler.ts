import type {
  ActionContext,
  DispatchResult,
  JobState,
  RoutinePlanner,
  RuntimeEventBus,
  StateStore,
} from "../runtime/types";
import type { ActionDispatcher } from "./dispatcher";

export interface SchedulerDeps {
  stateStore: StateStore;
  dispatcher: ActionDispatcher;
  eventBus: RuntimeEventBus;
  createContext: (job: JobState) => ActionContext;
  resolveRoutine: (routineName: string) => RoutinePlanner;
}

export class Scheduler {
  private intervalId: Timer | null = null;
  private readonly runningJobs = new Set<string>();

  constructor(
    private readonly deps: SchedulerDeps,
    private readonly tickMs = 1000,
  ) {}

  start(): void {
    if (this.intervalId) {
      return;
    }
    this.intervalId = setInterval(() => {
      void this.tick();
    }, this.tickMs);
  }

  stop(): void {
    if (!this.intervalId) {
      return;
    }
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  async tick(now = Date.now()): Promise<void> {
    const dueJobs = this.deps
      .stateStore
      .listJobs({ status: "pending" })
      .toSorted(comparePendingJobs)
      .filter((job) => !job.nextRunAt || job.nextRunAt <= now);

    for (const job of dueJobs) {
      if (this.runningJobs.has(job.id)) {
        continue;
      }
      this.runningJobs.add(job.id);
      void this.runJob(job).finally(() => {
        this.runningJobs.delete(job.id);
      });
    }
  }

  private async runJob(job: JobState): Promise<DispatchResult> {
    const runStartedAt = Date.now();
    const pendingBeforeDequeue = this.deps.stateStore.listJobs({ status: "pending" }).toSorted(comparePendingJobs);
    const queuePosition = pendingBeforeDequeue.findIndex((entry) => entry.id === job.id) + 1;
    this.deps.eventBus.emit("queue:dequeue", {
      jobId: job.id,
      botId: job.botId,
      routineName: job.routineName,
      queueSize: pendingBeforeDequeue.length,
      queuePosition: queuePosition > 0 ? queuePosition : 1,
      waitMs: Math.max(0, runStartedAt - job.createdAt),
    });
    this.deps.stateStore.updateJobStatus(job.id, "running");
    this.deps.eventBus.emit("bot:start", {
      botId: job.botId,
      routineName: job.routineName,
    });

    const ctx = this.deps.createContext(job);
    const planner = this.deps.resolveRoutine(job.routineName);
    const steps = await planner(ctx, job);
    this.deps.stateStore.saveDecisionLog({
      id: crypto.randomUUID(),
      jobId: job.id,
      actionName: "scheduler:plan",
      trace: steps.map((step) => `${step.actionName}${step.dependsOn ? ` <- ${step.dependsOn}` : ""}`),
      createdAt: Date.now(),
    });
    const dispatchResult = await this.deps.dispatcher.dispatchPlan(ctx, steps);

    const finalStatus = determineFinalStatus(job, dispatchResult);
    this.deps.stateStore.updateJobStatus(job.id, finalStatus, {
      lastResult: dispatchResult.results[dispatchResult.results.length - 1],
      lastRunAt: Date.now(),
      cyclesCompleted: job.cyclesCompleted + 1,
      nextRunAt: computeNextRunAt(job, Date.now()),
    });
    this.deps.eventBus.emit("queue:complete", {
      jobId: job.id,
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
  return job.nextRunAt;
}
