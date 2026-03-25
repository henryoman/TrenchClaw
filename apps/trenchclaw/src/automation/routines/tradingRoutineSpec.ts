import { z } from "zod";

import type { ActionStep, RetryPolicy } from "../../ai/contracts/types/action";
import type { RuntimeJobEnqueueRequest } from "../../ai/contracts/types/context";
import { loadRuntimeSettings } from "../../runtime/settings";
import {
  deriveEvenlySpacedIntervalMs,
  resolveIntervalDurationMs,
  resolveScheduledTimeUnixMs,
  scheduleDurationInputSchema,
} from "../../automation/triggers/time";
import { managedWalletSelectorSchema } from "../../solana/lib/wallet/walletSelector";
import { walletGroupNameSchema } from "../../solana/lib/wallet/walletTypes";

const walletNameSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]+$/);

const retryPolicySchema = z.object({
  maxAttempts: z.number().int().positive(),
  backoffMs: z.number().int().nonnegative(),
  backoffMultiplier: z.number().positive().optional(),
});

const stepCommonSchema = z.object({
  key: z.string().min(1).optional(),
  dependsOn: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
  retryPolicy: retryPolicySchema.optional(),
});

export const tradingSwapProviderPreferenceSchema = z.enum(["configured", "ultra", "standard"]);
export const resolvedTradingSwapProviderSchema = z.enum(["ultra", "standard"]);

export type TradingSwapProviderPreference = z.infer<typeof tradingSwapProviderPreferenceSchema>;
export type ResolvedTradingSwapProvider = z.infer<typeof resolvedTradingSwapProviderSchema>;

export const tradingManagedSwapSchema = z
  .object({
    provider: tradingSwapProviderPreferenceSchema.default("configured"),
    wallet: managedWalletSelectorSchema.optional(),
    walletGroup: walletGroupNameSchema.optional(),
    walletName: walletNameSchema.optional(),
    inputCoin: z.string().min(1),
    outputCoin: z.string().min(1),
    amount: z.union([z.number().positive(), z.string().min(1)]),
    amountUnit: z.enum(["ui", "native", "percent"]).optional(),
    mode: z.enum(["ExactIn", "ExactOut"]).optional(),
    executeTimeoutMs: z.number().int().positive().max(60_000).optional(),
    referralAccount: z.string().min(1).optional(),
    referralFee: z.number().int().nonnegative().max(10_000).optional(),
    coinAliases: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((value, ctx) => {
    const hasWalletGroup = typeof value.walletGroup === "string";
    const hasWalletName = typeof value.walletName === "string";
    if (!value.wallet && !hasWalletGroup && !hasWalletName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide wallet or walletGroup and walletName.",
        path: ["wallet"],
      });
    }
    if ((hasWalletGroup || hasWalletName) && hasWalletGroup !== hasWalletName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide walletGroup and walletName together.",
        path: hasWalletGroup ? ["walletName"] : ["walletGroup"],
      });
    }
  });

const routineBaseSchema = z.object({
  version: z.literal(1),
  routineId: z.string().trim().min(1).optional(),
  botId: z.string().trim().min(1).optional(),
});

const dcaScheduleSchema = z
  .object({
    installments: z.number().int().min(2).max(100),
    startAtUnixMs: z.number().int().nonnegative().optional(),
    startIn: scheduleDurationInputSchema.optional(),
    intervalMs: z.number().int().positive().optional(),
    interval: scheduleDurationInputSchema.optional(),
    endAtUnixMs: z.number().int().nonnegative().optional(),
  })
  .refine((value) => value.intervalMs !== undefined || value.interval !== undefined || value.endAtUnixMs !== undefined, {
    message: "Provide intervalMs, interval, or endAtUnixMs for DCA scheduling",
    path: ["intervalMs"],
  });

const customSequenceActionNameSchema = z.enum([
  "transfer",
  "closeTokenAccount",
  "getManagedWalletContents",
  "getManagedWalletSolBalances",
  "pingRuntime",
]);

const tradingSequenceStepSchema = z.discriminatedUnion("kind", [
  stepCommonSchema.extend({
    kind: z.literal("swap"),
    swap: tradingManagedSwapSchema,
  }),
  stepCommonSchema.extend({
    kind: z.literal("sleep"),
    waitMs: z.number().int().nonnegative().max(3_600_000),
  }),
  stepCommonSchema.extend({
    kind: z.literal("action"),
    actionName: customSequenceActionNameSchema,
    input: z.unknown(),
  }),
]);

const validateSequenceStepOrdering = (
  steps: Array<z.infer<typeof tradingSequenceStepSchema>>,
  ctx: z.RefinementCtx,
): void => {
  const seenKeys = new Set<string>();
  steps.forEach((step, index) => {
    const stepKey = resolveStepKey(step, index);
    if (seenKeys.has(stepKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate trading routine step key "${stepKey}"`,
        path: ["steps", index, "key"],
      });
      return;
    }
    seenKeys.add(stepKey);
    if (step.dependsOn && !seenKeys.has(step.dependsOn)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Step "${stepKey}" depends on "${step.dependsOn}", but dependencies must reference a prior step key`,
        path: ["steps", index, "dependsOn"],
      });
    }
  });
};

const swapOnceTradingRoutineSchema = routineBaseSchema.extend({
  kind: z.literal("swap_once"),
  executeAtUnixMs: z.number().int().nonnegative().optional(),
  executeIn: scheduleDurationInputSchema.optional(),
  swap: tradingManagedSwapSchema,
}).superRefine((value, ctx) => {
  if (value.executeAtUnixMs !== undefined && value.executeIn !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either executeAtUnixMs or executeIn, not both.",
      path: ["executeIn"],
    });
  }
});

const dcaTradingRoutineSchema = routineBaseSchema.extend({
  kind: z.literal("dca"),
  executionMode: z.enum(["inline_sleep", "staggered_jobs"]).default("inline_sleep"),
  schedule: dcaScheduleSchema,
  swap: tradingManagedSwapSchema,
}).superRefine((value, ctx) => {
  if (value.schedule.startAtUnixMs !== undefined && value.schedule.startIn !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either startAtUnixMs or startIn, not both.",
      path: ["schedule", "startIn"],
    });
  }
  if (value.schedule.intervalMs !== undefined && value.schedule.interval !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either intervalMs or interval, not both.",
      path: ["schedule", "interval"],
    });
  }
});

const actionSequenceTradingRoutineSchema = routineBaseSchema
  .extend({
    kind: z.literal("action_sequence"),
    executeAtUnixMs: z.number().int().nonnegative().optional(),
    executeIn: scheduleDurationInputSchema.optional(),
    steps: z.array(tradingSequenceStepSchema).min(1).max(100),
  })
  .superRefine((value, ctx) => {
    if (value.executeAtUnixMs !== undefined && value.executeIn !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either executeAtUnixMs or executeIn, not both.",
        path: ["executeIn"],
      });
    }
    validateSequenceStepOrdering(value.steps, ctx);
  });

export const tradingRoutineSpecSchema = z.discriminatedUnion("kind", [
  swapOnceTradingRoutineSchema,
  dcaTradingRoutineSchema,
  actionSequenceTradingRoutineSchema,
]);

export type TradingManagedSwap = z.infer<typeof tradingManagedSwapSchema>;
export type TradingRoutineSpec = z.infer<typeof tradingRoutineSpecSchema>;
export type TradingSequenceStep = z.infer<typeof tradingSequenceStepSchema>;

export interface PlannedTradingRoutineSubmission {
  tradingRoutineId: string;
  kind: TradingRoutineSpec["kind"];
  swapProvider?: ResolvedTradingSwapProvider;
  executionMode?: "inline_sleep" | "staggered_jobs";
  jobs: RuntimeJobEnqueueRequest[];
  steps?: ActionStep[];
}

const countDecimalPlaces = (value: string): number => {
  const trimmed = value.trim();
  const dotIndex = trimmed.indexOf(".");
  if (dotIndex === -1) {
    return 0;
  }
  return trimmed.length - dotIndex - 1;
};

const toScaledBigInt = (value: string, scale: number): bigint => {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw || "0";
  const fracPart = fracPartRaw.padEnd(scale, "0").slice(0, scale);
  const normalized = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, "") || "0";
  const bigintValue = BigInt(normalized);
  return negative ? -bigintValue : bigintValue;
};

const fromScaledBigInt = (value: bigint, scale: number): string => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const digits = absolute.toString().padStart(scale + 1, "0");
  if (scale === 0) {
    return `${negative ? "-" : ""}${digits}`;
  }
  const intPart = digits.slice(0, -scale) || "0";
  const fracPart = digits.slice(-scale).replace(/0+$/, "");
  const rendered = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
  return `${negative ? "-" : ""}${rendered}`;
};

const splitIntegerAmount = (total: bigint, parts: number): bigint[] => {
  const quotient = total / BigInt(parts);
  const remainder = total % BigInt(parts);
  return Array.from({ length: parts }, (_, index) =>
    quotient + (BigInt(index) < remainder ? 1n : 0n));
};

const splitScheduledAmount = (amount: number | string, parts: number): Array<number | string> => {
  if (parts <= 0) {
    throw new Error("Installments must be positive");
  }

  const rawValue = typeof amount === "number" ? amount.toString() : amount.trim();
  const percentMatch = rawValue.match(/^([0-9]*\.?[0-9]+)\s*%$/);
  if (percentMatch) {
    const scale = Math.min(9, countDecimalPlaces(percentMatch[1] ?? "") + 6);
    const total = toScaledBigInt(percentMatch[1] ?? "0", scale);
    return splitIntegerAmount(total, parts).map((part) => `${fromScaledBigInt(part, scale)}%`);
  }

  const nativeMatch = rawValue.match(/^([0-9]+)\s*(native|raw|lamports)$/i);
  if (nativeMatch) {
    const total = BigInt(nativeMatch[1] ?? "0");
    const unit = (nativeMatch[2] ?? "native").toLowerCase();
    return splitIntegerAmount(total, parts).map((part) => `${part.toString()} ${unit}`);
  }

  if (typeof amount === "number" && Number.isInteger(amount)) {
    return splitIntegerAmount(BigInt(amount), parts).map((part) => Number(part));
  }

  const numericMatch = rawValue.match(/^([0-9]*\.?[0-9]+)$/);
  if (!numericMatch) {
    throw new Error(`Unsupported DCA amount format "${rawValue}". Use plain numbers, percentages, or native units.`);
  }

  const scale = Math.min(9, countDecimalPlaces(numericMatch[1] ?? "") + 6);
  const total = toScaledBigInt(numericMatch[1] ?? "0", scale);
  return splitIntegerAmount(total, parts).map((part) => fromScaledBigInt(part, scale));
};

const resolveTradingExecuteAtUnixMs = (input: {
  executeAtUnixMs?: number;
  executeIn?: z.infer<typeof scheduleDurationInputSchema>;
  now?: number;
  label: string;
}): number | undefined =>
  resolveScheduledTimeUnixMs({
    atUnixMs: input.executeAtUnixMs,
    inDuration: input.executeIn,
    now: input.now,
    granularity: "seconds",
    label: input.label,
  });

const resolveTradingDcaStartAtUnixMs = (input: {
  startAtUnixMs?: number;
  startIn?: z.infer<typeof scheduleDurationInputSchema>;
  now?: number;
}): number =>
  resolveScheduledTimeUnixMs({
    atUnixMs: input.startAtUnixMs,
    inDuration: input.startIn,
    now: input.now,
    granularity: "seconds",
    label: "start",
  }) ?? Math.max(0, Math.trunc(input.now ?? Date.now()));

const resolveTradingDcaIntervalMs = (
  schedule: z.infer<typeof dcaTradingRoutineSchema>["schedule"],
  startAtUnixMs: number,
): number => {
  const explicitIntervalMs = resolveIntervalDurationMs({
    intervalMs: schedule.intervalMs,
    interval: schedule.interval,
    granularity: "seconds",
    label: "interval",
  });
  if (explicitIntervalMs !== undefined) {
    return explicitIntervalMs;
  }

  const endAtUnixMs = schedule.endAtUnixMs;
  if (typeof endAtUnixMs !== "number") {
    throw new Error("DCA schedule requires intervalMs, interval, or endAtUnixMs");
  }

  return deriveEvenlySpacedIntervalMs({
    startAtUnixMs,
    endAtUnixMs,
    installments: schedule.installments,
    granularity: "seconds",
    label: "DCA schedule",
  });
};

const resolveStepKey = (
  step: Pick<TradingSequenceStep, "key">,
  index: number,
): string => step.key ?? `step-${index + 1}`;

const createStepBase = (
  input: {
    key?: string;
    dependsOn?: string;
    idempotencyKey?: string;
    retryPolicy?: RetryPolicy;
  },
  fallbackKey: string,
  tradingRoutineId: string,
): Pick<ActionStep, "key" | "dependsOn" | "idempotencyKey" | "retryPolicy"> => ({
  key: input.key ?? fallbackKey,
  dependsOn: input.dependsOn,
  idempotencyKey: input.idempotencyKey ?? `${tradingRoutineId}:${input.key ?? fallbackKey}`,
  retryPolicy: input.retryPolicy,
});

const toManagedSwapActionInput = (
  swap: TradingManagedSwap,
  provider: ResolvedTradingSwapProvider,
): Record<string, unknown> => ({
  provider,
  wallet: swap.wallet,
  walletGroup: swap.walletGroup,
  walletName: swap.walletName,
  inputCoin: swap.inputCoin,
  outputCoin: swap.outputCoin,
  amount: swap.amount,
  amountUnit: swap.amountUnit,
  mode: swap.mode,
  executeTimeoutMs: swap.executeTimeoutMs,
  referralAccount: swap.referralAccount,
  referralFee: swap.referralFee,
  coinAliases: swap.coinAliases,
});

const buildActionSequenceSteps = (
  steps: Array<TradingSequenceStep>,
  provider: ResolvedTradingSwapProvider,
  tradingRoutineId: string,
): ActionStep[] =>
  steps.map((step, index) => {
    const fallbackKey = resolveStepKey(step, index);
    const base = createStepBase(step, fallbackKey, tradingRoutineId);

    if (step.kind === "swap") {
      return {
        ...base,
        actionName: "managedSwap",
        input: toManagedSwapActionInput(step.swap, provider),
      };
    }

    if (step.kind === "sleep") {
      return {
        ...base,
        actionName: "sleep",
        input: {
          waitMs: step.waitMs,
        },
      };
    }

    return {
      ...base,
      actionName: step.actionName,
      input: step.input,
    };
  });

const buildInlineDcaSteps = (
  spec: z.infer<typeof dcaTradingRoutineSchema>,
  provider: ResolvedTradingSwapProvider,
  tradingRoutineId: string,
): {
  executeAtUnixMs: number;
  intervalMs: number;
  steps: ActionStep[];
} => {
  const startAtUnixMs = resolveTradingDcaStartAtUnixMs({
    startAtUnixMs: spec.schedule.startAtUnixMs,
    startIn: spec.schedule.startIn,
  });
  const intervalMs = resolveTradingDcaIntervalMs(spec.schedule, startAtUnixMs);
  const splitAmounts = splitScheduledAmount(spec.swap.amount, spec.schedule.installments);
  const steps: ActionStep[] = [];
  let previousKey: string | undefined;

  splitAmounts.forEach((installmentAmount, index) => {
    const swapKey = `swap-${index + 1}`;
    steps.push({
      ...createStepBase(
        {
          key: swapKey,
          dependsOn: previousKey,
        },
        swapKey,
        tradingRoutineId,
      ),
      actionName: "managedSwap",
      input: toManagedSwapActionInput(
        {
          ...spec.swap,
          amount: installmentAmount,
        },
        provider,
      ),
    });

    previousKey = swapKey;
    if (index === splitAmounts.length - 1) {
      return;
    }

    const sleepKey = `sleep-${index + 1}`;
    steps.push({
      ...createStepBase(
        {
          key: sleepKey,
          dependsOn: swapKey,
        },
        sleepKey,
        tradingRoutineId,
      ),
      actionName: "sleep",
      input: {
        waitMs: intervalMs,
      },
    });
    previousKey = sleepKey;
  });

  return {
    executeAtUnixMs: startAtUnixMs,
    intervalMs,
    steps,
  };
};

const createBotId = (
  spec: TradingRoutineSpec,
  tradingRoutineId: string,
  suffix?: string,
): string => {
  if (spec.botId) {
    return suffix ? `${spec.botId}:${suffix}` : spec.botId;
  }
  return suffix ? `trading-routine:${tradingRoutineId}:${suffix}` : `trading-routine:${tradingRoutineId}`;
};

export const resolveRequestedTradingSwapProvider = async (
  requestedProvider: TradingSwapProviderPreference | undefined,
): Promise<ResolvedTradingSwapProvider> => {
  if (requestedProvider === "ultra") {
    return "ultra";
  }

  if (requestedProvider === "standard") {
    return "standard";
  }

  const settings = await loadRuntimeSettings();
  const configuredProvider = settings.trading.preferences.defaultSwapProvider;
  return configuredProvider === "standard" ? "standard" : "ultra";
};

export const planTradingRoutineSubmission = async (
  spec: TradingRoutineSpec,
): Promise<PlannedTradingRoutineSubmission> => {
  const tradingRoutineId = spec.routineId ?? crypto.randomUUID();

  if (spec.kind === "swap_once") {
    const swapProvider = await resolveRequestedTradingSwapProvider(spec.swap.provider);
    const steps: ActionStep[] = [
      {
        ...createStepBase({}, "swap-1", tradingRoutineId),
        actionName: "managedSwap",
        input: toManagedSwapActionInput(spec.swap, swapProvider),
      },
    ];

    return {
      tradingRoutineId,
      kind: spec.kind,
      swapProvider,
      jobs: [
        {
          botId: createBotId(spec, tradingRoutineId),
          routineName: "actionSequence",
          executeAtUnixMs: resolveTradingExecuteAtUnixMs({
            executeAtUnixMs: spec.executeAtUnixMs,
            executeIn: spec.executeIn,
            label: "execute",
          }),
          config: {
            type: "tradingRoutine",
            tradingRoutineId,
            kind: spec.kind,
            swapProvider,
            steps,
          },
        },
      ],
      steps,
    };
  }

  if (spec.kind === "dca") {
    const swapProvider = await resolveRequestedTradingSwapProvider(spec.swap.provider);
    if (spec.executionMode === "staggered_jobs") {
      const startAtUnixMs = resolveTradingDcaStartAtUnixMs({
        startAtUnixMs: spec.schedule.startAtUnixMs,
        startIn: spec.schedule.startIn,
      });
      const intervalMs = resolveTradingDcaIntervalMs(spec.schedule, startAtUnixMs);
      const splitAmounts = splitScheduledAmount(spec.swap.amount, spec.schedule.installments);
      const jobs = splitAmounts.map<RuntimeJobEnqueueRequest>((installmentAmount, index) => {
        const stepKey = `swap-${index + 1}`;
        return {
          botId: createBotId(spec, tradingRoutineId, stepKey),
          routineName: "actionSequence",
          executeAtUnixMs: startAtUnixMs + intervalMs * index,
          config: {
            type: "tradingRoutineSlice",
            tradingRoutineId,
            kind: spec.kind,
            executionMode: spec.executionMode,
            sequenceIndex: index + 1,
            installments: spec.schedule.installments,
            swapProvider,
            steps: [
              {
                ...createStepBase(
                  {
                    key: stepKey,
                    idempotencyKey: `${tradingRoutineId}:${stepKey}`,
                  },
                  stepKey,
                  tradingRoutineId,
                ),
                actionName: "managedSwap",
                input: toManagedSwapActionInput(
                  {
                    ...spec.swap,
                    amount: installmentAmount,
                  },
                  swapProvider,
                ),
              },
            ],
          },
        };
      });

      return {
        tradingRoutineId,
        kind: spec.kind,
        swapProvider,
        executionMode: spec.executionMode,
        jobs,
      };
    }

    const inlinePlan = buildInlineDcaSteps(spec, swapProvider, tradingRoutineId);
    return {
      tradingRoutineId,
      kind: spec.kind,
      swapProvider,
      executionMode: spec.executionMode,
      jobs: [
        {
          botId: createBotId(spec, tradingRoutineId),
          routineName: "actionSequence",
          executeAtUnixMs: inlinePlan.executeAtUnixMs,
          config: {
            type: "tradingRoutine",
            tradingRoutineId,
            kind: spec.kind,
            executionMode: spec.executionMode,
            schedule: {
              installments: spec.schedule.installments,
              intervalMs: inlinePlan.intervalMs,
            },
            swapProvider,
            steps: inlinePlan.steps,
          },
        },
      ],
      steps: inlinePlan.steps,
    };
  }

  const swapSteps = spec.steps.filter(
    (step): step is z.infer<typeof tradingSequenceStepSchema> & { kind: "swap" } => step.kind === "swap",
  );
  const swapProvider =
    swapSteps.length > 0
      ? await resolveRequestedTradingSwapProvider(swapSteps[0]?.swap.provider)
      : undefined;

  if (swapSteps.length > 1) {
    const providerNames = await Promise.all(
      swapSteps.map(async (step) => await resolveRequestedTradingSwapProvider(step.swap.provider)),
    );
    if (new Set(providerNames).size > 1) {
      throw new Error("All swap steps in one action_sequence must resolve to the same swap provider.");
    }
  }

  const provider = swapProvider ?? "ultra";
  const steps = buildActionSequenceSteps(spec.steps, provider, tradingRoutineId);

  return {
    tradingRoutineId,
    kind: spec.kind,
    swapProvider: swapProvider,
    jobs: [
      {
        botId: createBotId(spec, tradingRoutineId),
        routineName: "actionSequence",
        executeAtUnixMs: resolveTradingExecuteAtUnixMs({
          executeAtUnixMs: spec.executeAtUnixMs,
          executeIn: spec.executeIn,
          label: "execute",
        }),
        config: {
          type: "tradingRoutine",
          tradingRoutineId,
          kind: spec.kind,
          ...(swapProvider ? { swapProvider } : {}),
          steps,
        },
      },
    ],
    steps,
  };
};
