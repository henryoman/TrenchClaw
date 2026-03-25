import { z } from "zod";

import type { Action, ActionStep } from "../../../ai/contracts/types/action";
import type { RuntimeJobEnqueueRequest } from "../../../ai/contracts/types/context";
import type { JobState } from "../../../ai/contracts/types/state";
import {
  deriveEvenlySpacedIntervalMs,
  resolveIntervalDurationMs,
  resolveScheduledTimeUnixMs,
  scheduleDurationInputSchema,
} from "../../../automation/triggers/time";
import { managedWalletSelectorSchema } from "../../../solana/lib/wallet/walletSelector";
import { walletGroupNameSchema } from "../../../solana/lib/wallet/walletTypes";
import { amountInputSchema } from "./shared";

const walletNameSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]+$/);

const managedUltraSwapBaseSchema = amountInputSchema.extend({
  wallet: managedWalletSelectorSchema.optional(),
  walletGroup: walletGroupNameSchema.optional(),
  walletName: walletNameSchema.optional(),
  swapType: z.literal("ultra").default("ultra"),
  inputCoin: z.string().min(1),
  outputCoin: z.string().min(1),
  mode: z.enum(["ExactIn", "ExactOut"]).optional(),
  executeTimeoutMs: z.number().int().positive().max(60_000).optional(),
  referralAccount: z.string().min(1).optional(),
  referralFee: z.number().int().nonnegative().max(10_000).optional(),
  coinAliases: z.record(z.string(), z.string()).optional(),
}).superRefine((value, ctx) => {
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

const singleScheduleSchema = z.object({
  kind: z.literal("once"),
  executeAtUnixMs: z.number().int().nonnegative().optional(),
  executeIn: scheduleDurationInputSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.executeAtUnixMs !== undefined && value.executeIn !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either executeAtUnixMs or executeIn, not both.",
      path: ["executeIn"],
    });
  }
  if (value.executeAtUnixMs === undefined && value.executeIn === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either executeAtUnixMs or executeIn.",
      path: ["executeAtUnixMs"],
    });
  }
});

const dcaScheduleSchema = z
  .object({
    kind: z.literal("dca"),
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
  })
  .superRefine((value, ctx) => {
    if (value.startAtUnixMs !== undefined && value.startIn !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either startAtUnixMs or startIn, not both.",
        path: ["startIn"],
      });
    }
    if (value.intervalMs !== undefined && value.interval !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either intervalMs or interval, not both.",
        path: ["interval"],
      });
    }
  });

const scheduleManagedUltraSwapInputSchema = managedUltraSwapBaseSchema.extend({
  botId: z.string().trim().min(1).optional(),
  schedule: z.discriminatedUnion("kind", [singleScheduleSchema, dcaScheduleSchema]),
});

type ScheduleManagedUltraSwapInput = z.output<typeof scheduleManagedUltraSwapInputSchema>;

interface ScheduledSwapPlan {
  routineName: "actionSequence";
  executeAtUnixMs: number;
  steps: ActionStep[];
  scheduleSummary: {
    kind: "once" | "dca";
    installments: number;
    intervalMs: number;
  };
}

interface ScheduleManagedUltraSwapOutput {
  mode: "scheduled";
  job: JobState;
  routineName: "actionSequence";
  executeAtUnixMs: number;
  schedule: ScheduledSwapPlan["scheduleSummary"];
  steps: ActionStep[];
}

const asRuntimeJobEnqueuer = (
  value: unknown,
): ((input: RuntimeJobEnqueueRequest) => Promise<JobState>) | null => {
  if (typeof value !== "function") {
    return null;
  }
  return value as (input: RuntimeJobEnqueueRequest) => Promise<JobState>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

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

const splitScheduledAmount = (
  amount: number | string,
  parts: number,
): Array<number | string> => {
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
    throw new Error(
      `Unsupported DCA amount format "${rawValue}". Use plain numbers, percentages, or native units.`,
    );
  }

  const scale = Math.min(9, countDecimalPlaces(numericMatch[1] ?? "") + 6);
  const total = toScaledBigInt(numericMatch[1] ?? "0", scale);
  return splitIntegerAmount(total, parts).map((part) => fromScaledBigInt(part, scale));
};

const resolveDcaIntervalMs = (
  schedule: z.output<typeof dcaScheduleSchema>,
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

const buildScheduledSwapPlan = (input: ScheduleManagedUltraSwapInput): ScheduledSwapPlan => {
  const {
    botId: _botId,
    schedule,
    wallet,
    walletGroup,
    walletName,
    swapType,
    inputCoin,
    outputCoin,
    amount,
    amountUnit,
    mode,
    executeTimeoutMs,
    referralAccount,
    referralFee,
    coinAliases,
  } = input;

  const baseSwapInput = {
    wallet,
    walletGroup,
    walletName,
    swapType,
    inputCoin,
    outputCoin,
    amountUnit,
    mode,
    executeTimeoutMs,
    referralAccount,
    referralFee,
    coinAliases,
  };

  if (schedule.kind === "once") {
    return {
      routineName: "actionSequence",
      executeAtUnixMs:
        resolveScheduledTimeUnixMs({
          atUnixMs: schedule.executeAtUnixMs,
          inDuration: schedule.executeIn,
          granularity: "seconds",
          label: "execute",
        }) ?? Date.now(),
      scheduleSummary: {
        kind: "once",
        installments: 1,
        intervalMs: 0,
      },
      steps: [
        {
          key: "swap-1",
          actionName: "managedUltraSwap",
          input: {
            ...baseSwapInput,
            amount,
          },
        },
      ],
    };
  }

  const startAtUnixMs =
    resolveScheduledTimeUnixMs({
      atUnixMs: schedule.startAtUnixMs,
      inDuration: schedule.startIn,
      granularity: "seconds",
      label: "start",
    }) ?? Date.now();
  const intervalMs = resolveDcaIntervalMs(schedule, startAtUnixMs);
  const splitAmounts = splitScheduledAmount(amount, schedule.installments);
  const steps: ActionStep[] = [];
  let previousKey: string | undefined;

  splitAmounts.forEach((installmentAmount, index) => {
    const swapKey = `swap-${index + 1}`;
    steps.push({
      key: swapKey,
      dependsOn: previousKey,
      actionName: "managedUltraSwap",
      input: {
        ...baseSwapInput,
        amount: installmentAmount,
      },
    });

    previousKey = swapKey;
    if (index === splitAmounts.length - 1) {
      return;
    }

    const sleepKey = `sleep-${index + 1}`;
    steps.push({
      key: sleepKey,
      dependsOn: swapKey,
      actionName: "sleep",
      input: {
        waitMs: intervalMs,
      },
    });
    previousKey = sleepKey;
  });

  return {
    routineName: "actionSequence",
    executeAtUnixMs: startAtUnixMs,
    scheduleSummary: {
      kind: "dca",
      installments: schedule.installments,
      intervalMs,
    },
    steps,
  };
};

const buildBotId = (input: ScheduleManagedUltraSwapInput): string => {
  if (input.botId) {
    return input.botId;
  }

  const suffix =
    input.schedule.kind === "once"
      ? `once-${input.schedule.executeAtUnixMs}`
      : `dca-${input.schedule.installments}-${input.schedule.startAtUnixMs ?? "now"}`;
  return `swap-${input.walletGroup}-${input.walletName}-${suffix}`;
};

export const scheduleManagedUltraSwapAction: Action<
  ScheduleManagedUltraSwapInput,
  ScheduleManagedUltraSwapOutput
> = {
  name: "scheduleManagedUltraSwap",
  category: "wallet-based",
  subcategory: "swap",
  inputSchema: scheduleManagedUltraSwapInputSchema,
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
      const plan = buildScheduledSwapPlan(input);
      const job = await enqueueJob({
        botId: buildBotId(input),
        routineName: plan.routineName,
        executeAtUnixMs: plan.executeAtUnixMs,
        config: {
          type: input.schedule.kind === "dca" ? "managedUltraSwapDca" : "managedUltraSwapSchedule",
          schedule: plan.scheduleSummary,
          steps: plan.steps.map((step) => {
            if (!isRecord(step)) {
              return step;
            }
            return {
              key: step.key,
              dependsOn: step.dependsOn,
              actionName: step.actionName,
              input: step.input,
            };
          }),
        },
      });

      return {
        ok: true,
        retryable: false,
        data: {
          mode: "scheduled",
          job,
          routineName: plan.routineName,
          executeAtUnixMs: plan.executeAtUnixMs,
          schedule: plan.scheduleSummary,
          steps: plan.steps,
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
        code: "SCHEDULE_MANAGED_ULTRA_SWAP_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
