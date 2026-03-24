import { z } from "zod";

import type { Action } from "../../../../ai/contracts/types/action";
import { scheduleDurationInputSchema } from "../../../../runtime/scheduling/time";
import { managedWalletSelectorSchema } from "../../../lib/wallet/wallet-selector";
import {
  walletGroupNameSchema,
  walletNameSchema,
} from "../../../lib/wallet/wallet-types";
import type { TradingManagedSwap, TradingRoutineSpec } from "../../../trading/routine-spec";
import { tradingSwapProviderPreferenceSchema } from "../../../trading/routine-spec";
import {
  submitTradingRoutineAction,
  type SubmitTradingRoutineOutput,
} from "./submitTradingRoutine";

const scheduleManagedSwapInputSchema = z
  .object({
    kind: z.enum(["swap_once", "dca"]).default("swap_once"),
    routineId: z.string().trim().min(1).optional(),
    botId: z.string().trim().min(1).optional(),
    provider: tradingSwapProviderPreferenceSchema.default("configured"),
    wallet: managedWalletSelectorSchema.optional(),
    walletGroup: walletGroupNameSchema.optional(),
    walletName: walletNameSchema.optional(),
    inputCoin: z.string().trim().min(1),
    outputCoin: z.string().trim().min(1),
    amount: z.union([z.number().positive(), z.string().trim().min(1)]),
    amountUnit: z.enum(["ui", "native", "percent"]).optional(),
    mode: z.enum(["ExactIn", "ExactOut"]).optional(),
    executeTimeoutMs: z.number().int().positive().max(60_000).optional(),
    referralAccount: z.string().trim().min(1).optional(),
    referralFee: z.number().int().nonnegative().max(10_000).optional(),
    coinAliases: z.record(z.string(), z.string()).optional(),
    whenAtUnixMs: z.number().int().nonnegative().optional(),
    whenIn: scheduleDurationInputSchema.optional(),
    everyMs: z.number().int().positive().optional(),
    every: scheduleDurationInputSchema.optional(),
    installments: z.number().int().min(2).max(100).optional(),
    endAtUnixMs: z.number().int().nonnegative().optional(),
    executionMode: z.enum(["inline_sleep", "staggered_jobs"]).default("inline_sleep"),
    executeAtUnixMs: z.number().int().nonnegative().optional(),
    executeIn: scheduleDurationInputSchema.optional(),
    startAtUnixMs: z.number().int().nonnegative().optional(),
    startIn: scheduleDurationInputSchema.optional(),
    intervalMs: z.number().int().positive().optional(),
    interval: scheduleDurationInputSchema.optional(),
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

    const oneOffTimeCount = [
      value.whenAtUnixMs,
      value.whenIn,
      value.executeAtUnixMs,
      value.executeIn,
      value.startAtUnixMs,
      value.startIn,
    ].filter((entry) => entry !== undefined).length;
    const dcaIntervalCount = [
      value.everyMs,
      value.every,
      value.intervalMs,
      value.interval,
      value.endAtUnixMs,
    ].filter((entry) => entry !== undefined).length;

    if (value.kind === "swap_once") {
      if (oneOffTimeCount === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Provide whenAtUnixMs, whenIn, executeAtUnixMs, executeIn, startAtUnixMs, or startIn for a later one-off trade.",
          path: ["whenIn"],
        });
      }
      if (oneOffTimeCount > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Provide only one one-off schedule field.",
          path: ["whenIn"],
        });
      }
      if (dcaIntervalCount > 0 || value.installments !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "DCA-only fields are not valid when kind is swap_once.",
          path: ["kind"],
        });
      }
      return;
    }

    if (value.installments === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "installments is required when kind is dca.",
        path: ["installments"],
      });
    }

    const dcaStartCount = [
      value.whenAtUnixMs,
      value.whenIn,
      value.startAtUnixMs,
      value.startIn,
      value.executeAtUnixMs,
      value.executeIn,
    ].filter((entry) => entry !== undefined).length;

    if (dcaStartCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide only one DCA start field.",
        path: ["whenIn"],
      });
    }
    if (dcaIntervalCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide everyMs, every, intervalMs, interval, or endAtUnixMs when kind is dca.",
        path: ["every"],
      });
    }
    if ([value.everyMs, value.every, value.intervalMs, value.interval].filter((entry) => entry !== undefined).length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide only one repeating interval field for DCA.",
        path: ["every"],
      });
    }
  });

type ScheduleManagedSwapInput = z.output<typeof scheduleManagedSwapInputSchema>;

const buildManagedSwapInput = (input: ScheduleManagedSwapInput): TradingManagedSwap => ({
  provider: input.provider,
  wallet: input.wallet,
  walletGroup: input.walletGroup,
  walletName: input.walletName,
  inputCoin: input.inputCoin,
  outputCoin: input.outputCoin,
  amount: input.amount,
  amountUnit: input.amountUnit,
  mode: input.mode,
  executeTimeoutMs: input.executeTimeoutMs,
  referralAccount: input.referralAccount,
  referralFee: input.referralFee,
  coinAliases: input.coinAliases,
});

const resolveOneOffSchedule = (input: ScheduleManagedSwapInput): Pick<TradingRoutineSpec & { kind: "swap_once" }, "executeAtUnixMs" | "executeIn"> => ({
  ...(input.whenAtUnixMs !== undefined ? { executeAtUnixMs: input.whenAtUnixMs } : {}),
  ...(input.whenIn !== undefined ? { executeIn: input.whenIn } : {}),
  ...(input.executeAtUnixMs !== undefined ? { executeAtUnixMs: input.executeAtUnixMs } : {}),
  ...(input.executeIn !== undefined ? { executeIn: input.executeIn } : {}),
  ...(input.startAtUnixMs !== undefined ? { executeAtUnixMs: input.startAtUnixMs } : {}),
  ...(input.startIn !== undefined ? { executeIn: input.startIn } : {}),
});

const resolveDcaSchedule = (input: ScheduleManagedSwapInput): Extract<TradingRoutineSpec, { kind: "dca" }>["schedule"] => ({
  installments: input.installments ?? 2,
  ...(input.whenAtUnixMs !== undefined ? { startAtUnixMs: input.whenAtUnixMs } : {}),
  ...(input.whenIn !== undefined ? { startIn: input.whenIn } : {}),
  ...(input.startAtUnixMs !== undefined ? { startAtUnixMs: input.startAtUnixMs } : {}),
  ...(input.startIn !== undefined ? { startIn: input.startIn } : {}),
  ...(input.executeAtUnixMs !== undefined ? { startAtUnixMs: input.executeAtUnixMs } : {}),
  ...(input.executeIn !== undefined ? { startIn: input.executeIn } : {}),
  ...(input.everyMs !== undefined ? { intervalMs: input.everyMs } : {}),
  ...(input.every !== undefined ? { interval: input.every } : {}),
  ...(input.intervalMs !== undefined ? { intervalMs: input.intervalMs } : {}),
  ...(input.interval !== undefined ? { interval: input.interval } : {}),
  ...(input.endAtUnixMs !== undefined ? { endAtUnixMs: input.endAtUnixMs } : {}),
});

const toTradingRoutineSpec = (input: ScheduleManagedSwapInput): TradingRoutineSpec => {
  const base = {
    version: 1 as const,
    ...(input.routineId ? { routineId: input.routineId } : {}),
    ...(input.botId ? { botId: input.botId } : {}),
    swap: buildManagedSwapInput(input),
  };

  if (input.kind === "swap_once") {
    return {
      ...base,
      kind: "swap_once",
      ...resolveOneOffSchedule(input),
    };
  }

  return {
    ...base,
    kind: "dca",
    executionMode: input.executionMode,
    schedule: resolveDcaSchedule(input),
  };
};

export const scheduleManagedSwapAction: Action<
  ScheduleManagedSwapInput,
  SubmitTradingRoutineOutput
> = {
  name: "scheduleManagedSwap",
  category: "data-based",
  inputSchema: scheduleManagedSwapInputSchema,
  async execute(ctx, input) {
    return await submitTradingRoutineAction.execute(ctx, toTradingRoutineSpec(input));
  },
};
