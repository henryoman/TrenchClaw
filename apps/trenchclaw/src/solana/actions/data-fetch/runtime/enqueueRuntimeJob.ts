import { z } from "zod";

import type { Action } from "../../../../ai/contracts/types/action";
import type { RuntimeJobEnqueueRequest } from "../../../../ai/contracts/types/context";
import type { JobState } from "../../../../ai/contracts/types/state";

const enqueueRuntimeJobInputSchema = z.object({
  botId: z.string().trim().min(1),
  routineName: z.string().trim().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
  totalCycles: z.number().int().positive().optional(),
  executeAtUnixMs: z.number().int().nonnegative().optional(),
});

type EnqueueRuntimeJobInput = z.output<typeof enqueueRuntimeJobInputSchema>;

interface EnqueueRuntimeJobOutput {
  mode: "ready" | "scheduled";
  scheduledForUnixMs: number;
  delayMs: number;
  job: JobState;
}

const asRuntimeJobEnqueuer = (
  value: unknown,
): ((input: RuntimeJobEnqueueRequest) => Promise<JobState>) | null => {
  if (typeof value !== "function") {
    return null;
  }
  return value as (input: RuntimeJobEnqueueRequest) => Promise<JobState>;
};

export const enqueueRuntimeJobAction: Action<EnqueueRuntimeJobInput, EnqueueRuntimeJobOutput> = {
  name: "enqueueRuntimeJob",
  category: "data-based",
  inputSchema: enqueueRuntimeJobInputSchema,
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
      const job = await enqueueJob({
        botId: input.botId,
        routineName: input.routineName,
        config: input.config,
        totalCycles: input.totalCycles,
        executeAtUnixMs: input.executeAtUnixMs,
      });
      const scheduledForUnixMs = job.nextRunAt ?? Date.now();
      const delayMs = Math.max(0, scheduledForUnixMs - Date.now());

      return {
        ok: true,
        retryable: false,
        data: {
          mode: delayMs > 0 ? "scheduled" : "ready",
          scheduledForUnixMs,
          delayMs,
          job,
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
        code: "QUEUE_ENQUEUE_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
