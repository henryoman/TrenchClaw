import type { DispatchResult } from "../contracts/action";
import type { ActionContext } from "../contracts/context";
import type { RuntimeEventBus } from "../contracts/events";
import type { RoutinePlanner } from "../contracts/scheduler";
import type { JobState, StateStore } from "../contracts/state";
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
    this.deps.stateStore.updateJobStatus(job.id, "running");
    this.deps.eventBus.emit("bot:start", {
      botId: job.botId,
      routineName: job.routineName,
    });

    const ctx = this.deps.createContext(job);
    const planner = this.deps.resolveRoutine(job.routineName);
    const steps = await planner(ctx, job);
    const dispatchResult = await this.deps.dispatcher.dispatchPlan(ctx, steps);

    const finalStatus = determineFinalStatus(job, dispatchResult);
    this.deps.stateStore.updateJobStatus(job.id, finalStatus, {
      lastResult: dispatchResult.results[dispatchResult.results.length - 1],
      lastRunAt: Date.now(),
      cyclesCompleted: job.cyclesCompleted + 1,
      nextRunAt: computeNextRunAt(job, Date.now()),
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

function determineFinalStatus(job: JobState, result: DispatchResult): JobState["status"] {
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
