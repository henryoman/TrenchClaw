import { z } from "zod";

import type { Action, ActionStep } from "../../../../../ai/runtime/types/action";
import type { RuntimeJobEnqueueRequest } from "../../../../../ai/runtime/types/context";
import type { JobState } from "../../../../../ai/runtime/types/state";
import { walletGroupNameSchema } from "../../../../lib/wallet/wallet-types";
import { triggerCreateOrderInputSchema } from "./shared";

const walletNameSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]+$/);

const singleScheduleSchema = z.object({
  kind: z.literal("once"),
  executeAtUnixMs: z.number().int().nonnegative(),
});

const dcaScheduleSchema = z
  .object({
    kind: z.literal("dca"),
    installments: z.number().int().min(2).max(100),
    startAtUnixMs: z.number().int().nonnegative().optional(),
    intervalMs: z.number().int().positive().optional(),
    endAtUnixMs: z.number().int().nonnegative().optional(),
  })
  .refine((value) => value.intervalMs !== undefined || value.endAtUnixMs !== undefined, {
    message: "Provide either intervalMs or endAtUnixMs for DCA scheduling",
    path: ["intervalMs"],
  });

const scheduleManagedTriggerOrderInputSchema = triggerCreateOrderInputSchema.and(
  z.object({
    walletGroup: walletGroupNameSchema,
    walletName: walletNameSchema,
    botId: z.string().trim().min(1).optional(),
    schedule: z.discriminatedUnion("kind", [singleScheduleSchema, dcaScheduleSchema]),
  }),
);

type ScheduleManagedTriggerOrderInput = z.output<typeof scheduleManagedTriggerOrderInputSchema>;

interface ScheduledTriggerPlan {
  routineName: "actionSequence";
  executeAtUnixMs: number;
  steps: ActionStep[];
  scheduleSummary: {
    kind: "once" | "dca";
    installments: number;
    intervalMs: number;
  };
}

interface ScheduleManagedTriggerOrderOutput {
  mode: "scheduled";
  job: JobState;
  routineName: "actionSequence";
  executeAtUnixMs: number;
  schedule: ScheduledTriggerPlan["scheduleSummary"];
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
  if (typeof schedule.intervalMs === "number") {
    return schedule.intervalMs;
  }

  const endAtUnixMs = schedule.endAtUnixMs;
  if (typeof endAtUnixMs !== "number") {
    throw new Error("DCA schedule requires intervalMs or endAtUnixMs");
  }
  if (endAtUnixMs <= startAtUnixMs) {
    throw new Error("DCA endAtUnixMs must be greater than startAtUnixMs");
  }

  const spanMs = endAtUnixMs - startAtUnixMs;
  const gaps = schedule.installments - 1;
  return Math.max(1, Math.floor(spanMs / gaps));
};

const buildScheduledTriggerPlan = (input: ScheduleManagedTriggerOrderInput): ScheduledTriggerPlan => {
  const {
    botId: _botId,
    schedule,
    walletGroup,
    walletName,
    inputCoin,
    outputCoin,
    makingAmount,
    makingAmountUnit,
    takingAmount,
    takingAmountUnit,
    limitPrice,
    coinAliases,
    feeAccount,
    feeBps,
    slippageBps,
    expiredAtUnixSeconds,
    computeUnitPrice,
    wrapAndUnwrapSol,
  } = input;

  const baseTriggerInput = {
    walletGroup,
    walletName,
    inputCoin,
    outputCoin,
    makingAmountUnit,
    takingAmountUnit,
    coinAliases,
    feeAccount,
    feeBps,
    slippageBps,
    expiredAtUnixSeconds,
    computeUnitPrice,
    wrapAndUnwrapSol,
  };

  if (schedule.kind === "once") {
    return {
      routineName: "actionSequence",
      executeAtUnixMs: schedule.executeAtUnixMs,
      scheduleSummary: {
        kind: "once",
        installments: 1,
        intervalMs: 0,
      },
      steps: [
        {
          key: "trigger-1",
          actionName: "managedTriggerOrder",
          input: {
            ...baseTriggerInput,
            makingAmount,
            ...(takingAmount === undefined ? { limitPrice } : { takingAmount }),
          },
        },
      ],
    };
  }

  const startAtUnixMs = schedule.startAtUnixMs ?? Date.now();
  const intervalMs = resolveDcaIntervalMs(schedule, startAtUnixMs);
  const makingAmounts = splitScheduledAmount(makingAmount, schedule.installments);
  const takingAmounts = takingAmount === undefined ? null : splitScheduledAmount(takingAmount, schedule.installments);
  const steps: ActionStep[] = [];
  let previousKey: string | undefined;

  makingAmounts.forEach((installmentMakingAmount, index) => {
    const triggerKey = `trigger-${index + 1}`;
    steps.push({
      key: triggerKey,
      dependsOn: previousKey,
      actionName: "managedTriggerOrder",
      input: {
        ...baseTriggerInput,
        makingAmount: installmentMakingAmount,
        ...(takingAmounts === null ? { limitPrice } : { takingAmount: takingAmounts[index] }),
      },
    });

    previousKey = triggerKey;
    if (index === makingAmounts.length - 1) {
      return;
    }

    const sleepKey = `sleep-${index + 1}`;
    steps.push({
      key: sleepKey,
      dependsOn: triggerKey,
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

const buildBotId = (input: ScheduleManagedTriggerOrderInput): string => {
  if (input.botId) {
    return input.botId;
  }

  const suffix =
    input.schedule.kind === "once"
      ? `once-${input.schedule.executeAtUnixMs}`
      : `dca-${input.schedule.installments}-${input.schedule.startAtUnixMs ?? "now"}`;
  return `trigger-${input.walletGroup}-${input.walletName}-${suffix}`;
};

export const scheduleManagedTriggerOrderAction: Action<
  ScheduleManagedTriggerOrderInput,
  ScheduleManagedTriggerOrderOutput
> = {
  name: "scheduleManagedTriggerOrder",
  category: "wallet-based",
  subcategory: "trigger",
  inputSchema: scheduleManagedTriggerOrderInputSchema,
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
      const plan = buildScheduledTriggerPlan(input);
      const job = await enqueueJob({
        botId: buildBotId(input),
        routineName: plan.routineName,
        executeAtUnixMs: plan.executeAtUnixMs,
        config: {
          type: input.schedule.kind === "dca" ? "managedTriggerOrderDca" : "managedTriggerOrderSchedule",
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
        code: "SCHEDULE_MANAGED_TRIGGER_ORDER_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
