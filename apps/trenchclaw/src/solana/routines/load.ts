import path from "node:path";
import { z } from "zod";

import type { RoutinePlanner } from "../../ai/runtime/types/scheduler";
import { resolveBundledBrainPath } from "../../runtime/runtime-paths";

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

const createWalletsRoutineConfigSchema = z.record(z.string(), z.unknown());

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

export const createWalletsRoutine: RoutinePlanner = async (_ctx, job) => {
  const config = createWalletsRoutineConfigSchema.parse(job.config);

  return [
    {
      key: "create-wallets",
      actionName: "createWallets",
      input: config,
      idempotencyKey: `${job.id}:create-wallets`,
    },
  ];
};

const BUILTIN_ROUTINES: Record<string, RoutinePlanner> = {
  actionSequence: actionSequenceRoutine,
  createWallets: createWalletsRoutine,
};

const workspaceRoutineNameSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]+$/);
const workspaceRoutineDefinitionSchema = z
  .object({
    routineName: z.string().min(1),
    config: z.record(z.string(), z.unknown()).optional(),
    steps: z.array(z.unknown()).optional(),
  })
  .passthrough();

const WORKSPACE_ROUTINES_DIRECTORY = resolveBundledBrainPath("workspace/routines");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const normalizeRoutineLookupName = (routineName: string): string => {
  const trimmed = routineName.trim();
  if (!trimmed) {
    throw new Error("Routine name cannot be empty");
  }

  return trimmed.endsWith(".routine.json") ? trimmed.slice(0, -".routine.json".length) : trimmed;
};

const resolveWorkspaceRoutineFilePath = (routineName: string): string => {
  const safeRoutineName = workspaceRoutineNameSchema.parse(normalizeRoutineLookupName(routineName));
  return path.join(WORKSPACE_ROUTINES_DIRECTORY, `${safeRoutineName}.routine.json`);
};

const readWorkspaceRoutineDefinition = async (routineName: string) => {
  const filePath = resolveWorkspaceRoutineFilePath(routineName);
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }

  const parsed = await file.json();
  const definition = workspaceRoutineDefinitionSchema.parse(parsed);
  return {
    filePath,
    definition,
  };
};

const mergeWorkspaceRoutineConfig = (
  definition: z.infer<typeof workspaceRoutineDefinitionSchema>,
  jobConfig: Record<string, unknown>,
): Record<string, unknown> => {
  const mergedConfig: Record<string, unknown> = {
    ...definition.config,
    ...jobConfig,
  };

  if (definition.steps !== undefined && mergedConfig.steps === undefined) {
    mergedConfig.steps = definition.steps;
  }

  return mergedConfig;
};

const createWorkspaceDelegatingPlanner = (workspaceRoutineName: string): RoutinePlanner => {
  return async (ctx, job) => {
    const loaded = await readWorkspaceRoutineDefinition(workspaceRoutineName);
    if (!loaded) {
      const supported = Object.keys(BUILTIN_ROUTINES).join(", ");
      const expectedFile = resolveWorkspaceRoutineFilePath(workspaceRoutineName);
      throw new Error(
        `Unsupported routine "${workspaceRoutineName}". Supported built-ins: ${supported}. Or create ${expectedFile}.`,
      );
    }

    const delegatedRoutine = BUILTIN_ROUTINES[loaded.definition.routineName];
    if (!delegatedRoutine) {
      throw new Error(
        `Workspace routine "${workspaceRoutineName}" points to unsupported routine "${loaded.definition.routineName}" in ${loaded.filePath}`,
      );
    }

    return delegatedRoutine(ctx, {
      ...job,
      routineName: loaded.definition.routineName,
      config: mergeWorkspaceRoutineConfig(loaded.definition, isRecord(job.config) ? job.config : {}),
    });
  };
};

export const loadRoutinePlanner = (routineName: string): RoutinePlanner => {
  const normalizedRoutineName = normalizeRoutineLookupName(routineName);
  return BUILTIN_ROUTINES[normalizedRoutineName] ?? createWorkspaceDelegatingPlanner(normalizedRoutineName);
};

export const listBuiltinRoutineNames = (): string[] => Object.keys(BUILTIN_ROUTINES);
