import type { Action, ActionStep } from "../../../../ai/runtime/types/action";
import type { RuntimeJobEnqueueRequest } from "../../../../ai/runtime/types/context";
import type { JobState } from "../../../../ai/runtime/types/state";
import {
  planTradingRoutineSubmission,
  tradingRoutineSpecSchema,
  type TradingRoutineSpec,
} from "../../../trading/routine-spec";

const asRuntimeJobEnqueuer = (
  value: unknown,
): ((input: RuntimeJobEnqueueRequest) => Promise<JobState>) | null => {
  if (typeof value !== "function") {
    return null;
  }
  return value as (input: RuntimeJobEnqueueRequest) => Promise<JobState>;
};

export interface SubmitTradingRoutineOutput {
  mode: "ready" | "scheduled" | "mixed";
  tradingRoutineId: string;
  kind: TradingRoutineSpec["kind"];
  executionMode?: "inline_sleep" | "staggered_jobs";
  swapProvider?: "ultra" | "standard";
  jobCount: number;
  jobs: JobState[];
  plannedSteps?: ActionStep[];
}

const resolveSubmissionMode = (jobs: JobState[]): SubmitTradingRoutineOutput["mode"] => {
  const delays = jobs.map((job) => Math.max(0, (job.nextRunAt ?? Date.now()) - Date.now()));
  const hasReady = delays.some((delayMs) => delayMs === 0);
  const hasScheduled = delays.some((delayMs) => delayMs > 0);
  if (hasReady && hasScheduled) {
    return "mixed";
  }
  return hasScheduled ? "scheduled" : "ready";
};

export const submitTradingRoutineAction: Action<
  TradingRoutineSpec,
  SubmitTradingRoutineOutput
> = {
  name: "submitTradingRoutine",
  category: "data-based",
  inputSchema: tradingRoutineSpecSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();
    const enqueueJob = asRuntimeJobEnqueuer(ctx.enqueueJob);

    if (!enqueueJob) {
      return {
        ok: false,
        retryable: false,
        error: "enqueueJob is not available in action context",
        code: "QUEUE_UNAVAILABLE",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }

    try {
      const plan = await planTradingRoutineSubmission(input);
      const jobs = await Promise.all(plan.jobs.map(async (job) => await enqueueJob(job)));

      return {
        ok: true,
        retryable: false,
        data: {
          mode: resolveSubmissionMode(jobs),
          tradingRoutineId: plan.tradingRoutineId,
          kind: plan.kind,
          executionMode: plan.executionMode,
          swapProvider: plan.swapProvider,
          jobCount: jobs.length,
          jobs,
          plannedSteps: plan.steps,
        },
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    } catch (error) {
      return {
        ok: false,
        retryable: false,
        error: error instanceof Error ? error.message : String(error),
        code: "SUBMIT_TRADING_ROUTINE_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
