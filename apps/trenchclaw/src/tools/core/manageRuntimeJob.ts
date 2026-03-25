import { z } from "zod";

import type { Action } from "../../ai/contracts/types/action";
import type { JobState, StateStore } from "../../ai/contracts/types/state";
import type { RuntimeJobControlRequest } from "../../ai/contracts/types/context";

const manageRuntimeJobInputSchema = z
  .object({
    jobId: z.string().trim().min(1).optional(),
    jobSerial: z.number().int().positive().optional(),
    operation: z.enum(["pause", "cancel", "resume"]),
  })
  .refine((value) => value.jobId || value.jobSerial, {
    message: "Provide either jobId or jobSerial",
    path: ["jobId"],
  });

type ManageRuntimeJobInput = z.output<typeof manageRuntimeJobInputSchema>;

interface ManageRuntimeJobOutput {
  job: JobState;
  operation: "pause" | "cancel" | "resume";
}

const asRuntimeJobManager = (
  value: unknown,
): ((input: RuntimeJobControlRequest) => Promise<JobState>) | null => {
  if (typeof value !== "function") {
    return null;
  }
  return value as (input: RuntimeJobControlRequest) => Promise<JobState>;
};

const asRuntimeStore = (value: unknown): StateStore | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as StateStore;
};

export const manageRuntimeJobAction: Action<ManageRuntimeJobInput, ManageRuntimeJobOutput> = {
  name: "manageRuntimeJob",
  category: "data-based",
  inputSchema: manageRuntimeJobInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();
    const manageJob = asRuntimeJobManager(ctx.manageJob);
    const stateStore = asRuntimeStore(ctx.stateStore);

    if (!manageJob) {
      return {
        ok: false,
        retryable: false,
        error: "manageJob is not available in action context",
        code: "JOB_CONTROL_UNAVAILABLE",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }

    try {
      const resolvedJobId =
        input.jobId ??
        (input.jobSerial && stateStore ? stateStore.getJobBySerialNumber(input.jobSerial)?.id : undefined);
      if (!resolvedJobId) {
        throw new Error(
          input.jobSerial
            ? `Job serial "${input.jobSerial}" was not found`
            : "A matching job id could not be resolved",
        );
      }
      const job = await manageJob({
        jobId: resolvedJobId,
        operation: input.operation,
      });

      return {
        ok: true,
        retryable: false,
        data: {
          job,
          operation: input.operation,
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
        code: "JOB_CONTROL_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
