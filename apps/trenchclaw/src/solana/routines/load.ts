import path from "node:path";
import { z } from "zod";

import type { RoutinePlanner } from "../../ai/contracts/types/scheduler";
import { resolveActiveInstanceWorkspaceRoutinesRootOrThrow } from "../../runtime/instance/workspace";
import { createWalletsRoutine } from "./create-wallets";

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

const walletInventoryScanRoutineConfigSchema = z.object({
  requestKey: z.string().min(1),
  summaryDepth: z.enum(["summary", "full"]).default("full"),
  input: z.object({
    instanceId: z.string().trim().min(1).max(64).optional(),
    wallet: z.string().trim().min(1).optional(),
    wallets: z.array(z.string().trim().min(1)).max(100).optional(),
    walletGroup: z.string().trim().min(1).optional(),
    walletNames: z.array(z.string().trim().min(1)).max(100).optional(),
    includeZeroBalances: z.boolean().default(false),
  }),
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

export const walletInventoryScanRoutine: RoutinePlanner = async (_ctx, job) => {
  const config = walletInventoryScanRoutineConfigSchema.parse(job.config);
  return [
    {
      key: "wallet-inventory-scan",
      actionName: "getManagedWalletContents",
      input: config.input,
      idempotencyKey: `${job.id}:wallet-inventory-scan`,
    },
  ];
};

export const walletContentsScanRoutine: RoutinePlanner = async (_ctx, job) => {
  const config = walletInventoryScanRoutineConfigSchema.parse(job.config);
  return [
    {
      key: "wallet-contents-scan",
      actionName: "getWalletContents",
      input: config.input,
      idempotencyKey: `${job.id}:wallet-contents-scan`,
    },
  ];
};

export const runtimeWakeupRoutine: RoutinePlanner = async (_ctx, job) => {
  const instanceId = typeof job.config.instanceId === "string" ? job.config.instanceId.trim() : undefined;
  return [
    {
      key: "runtime-wakeup-check",
      actionName: "runWakeupCheck",
      input: {
        trigger: "scheduled",
        ...(instanceId ? { instanceId } : {}),
      },
      idempotencyKey: `${job.id}:runtime-wakeup-check`,
    },
  ];
};

const BUILTIN_ROUTINES: Record<string, RoutinePlanner> = {
  actionSequence: actionSequenceRoutine,
  createWallets: createWalletsRoutine,
  runtimeWakeup: runtimeWakeupRoutine,
  walletContentsScan: walletContentsScanRoutine,
  walletInventoryScan: walletInventoryScanRoutine,
};

const workspaceRoutineNameSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]+$/);
const workspaceRoutineDefinitionSchema = z
  .object({
    routineName: z.string().min(1),
    config: z.record(z.string(), z.unknown()).optional(),
    steps: z.array(z.unknown()).optional(),
  })
  .passthrough();

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
  return path.join(resolveActiveInstanceWorkspaceRoutinesRootOrThrow(), `${safeRoutineName}.routine.json`);
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
