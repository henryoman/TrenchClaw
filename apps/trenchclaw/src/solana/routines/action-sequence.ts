import { z } from "zod";

import type { RoutinePlanner } from "../../ai/runtime/types/scheduler";

const retryPolicySchema = z.object({
  maxAttempts: z.number().int().positive(),
  backoffMs: z.number().int().nonnegative(),
  backoffMultiplier: z.number().positive().optional(),
});

const actionSequenceRoutineConfigSchema = z.object({
  steps: z
    .array(
      z.object({
        key: z.string().min(1).optional(),
        actionName: z.string().min(1),
        input: z.unknown(),
        dependsOn: z.string().min(1).optional(),
        idempotencyKey: z.string().min(1).optional(),
        retryPolicy: retryPolicySchema.optional(),
      }),
    )
    .min(1),
});

export const actionSequenceRoutine: RoutinePlanner = async (_ctx, job) => {
  const config = actionSequenceRoutineConfigSchema.parse(job.config);
  const seenKeys = new Set<string>();

  config.steps.forEach((step, index) => {
    const stepKey = step.key ?? `step-${index + 1}`;
    if (seenKeys.has(stepKey)) {
      throw new Error(`Duplicate action-sequence step key "${stepKey}"`);
    }
    seenKeys.add(stepKey);

    if (step.dependsOn && !seenKeys.has(step.dependsOn)) {
      throw new Error(
        `Step "${stepKey}" depends on "${step.dependsOn}", but dependencies must reference a prior step key`,
      );
    }
  });

  return config.steps.map((step, index) => {
    const stepKey = step.key ?? `step-${index + 1}`;

    return {
      key: stepKey,
      actionName: step.actionName,
      input: step.input,
      dependsOn: step.dependsOn,
      idempotencyKey: step.idempotencyKey ?? `${job.id}:${stepKey}`,
      retryPolicy: step.retryPolicy,
    };
  });
};
