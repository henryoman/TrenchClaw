import { z } from "zod";

import type { Action } from "../../../../../ai/runtime/types/action";
import { managedWalletSelectorSchema } from "../../../../lib/wallet/wallet-selector";
import { walletGroupNameSchema, walletNameSchema } from "../../../../lib/wallet/wallet-types";
import { normalizeCoinToMint } from "../ultra/shared";
import { resolveTriggerAdapter, resolveWalletAddressFromInput } from "./shared";

const getTriggerOrdersInputSchema = z.object({
  wallet: managedWalletSelectorSchema.optional(),
  walletGroup: walletGroupNameSchema.optional(),
  walletName: walletNameSchema.optional(),
  user: z.string().trim().min(1).optional(),
  orderStatus: z.enum(["active", "history"]),
  inputMint: z.string().trim().min(1).optional(),
  outputMint: z.string().trim().min(1).optional(),
  page: z.number().int().positive().default(1),
  includeFailedTx: z.boolean().optional(),
  coinAliases: z.record(z.string(), z.string()).optional(),
}).superRefine((value, ctx) => {
  const hasWalletGroup = typeof value.walletGroup === "string";
  const hasWalletName = typeof value.walletName === "string";
  if (!value.wallet && !value.user && !hasWalletGroup && !hasWalletName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide wallet, walletGroup and walletName, or user.",
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

type GetTriggerOrdersInput = z.output<typeof getTriggerOrdersInputSchema>;

export interface GetTriggerOrdersOutput {
  user: string;
  orderStatus: string;
  page: number;
  totalPages: number;
  hasMoreData: boolean;
  orders: Array<{
    orderKey: string | null;
    userPubkey: string | null;
    inputMint: string | null;
    outputMint: string | null;
    makingAmount: string | null;
    takingAmount: string | null;
    remainingMakingAmount: string | null;
    remainingTakingAmount: string | null;
    rawMakingAmount: string | null;
    rawTakingAmount: string | null;
    rawRemainingMakingAmount: string | null;
    rawRemainingTakingAmount: string | null;
    slippageBps: string | null;
    expiredAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    status: string | null;
    openTx: string | null;
    closeTx: string | null;
    derivedTriggerPrice: string | null;
    raw: Record<string, unknown>;
  }>;
  raw: Record<string, unknown>;
}

const toNullableString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const deriveOrderPrice = (order: Record<string, unknown>): string | null => {
  const makingAmount = toNullableString(order.makingAmount);
  const takingAmount = toNullableString(order.takingAmount);
  if (!makingAmount || !takingAmount) {
    return null;
  }
  const making = Number(makingAmount);
  const taking = Number(takingAmount);
  if (!Number.isFinite(making) || !Number.isFinite(taking) || making <= 0) {
    return null;
  }
  return String(taking / making);
};

export const getTriggerOrdersAction: Action<GetTriggerOrdersInput, GetTriggerOrdersOutput> = {
  name: "getTriggerOrders",
  category: "wallet-based",
  subcategory: "read-only",
  inputSchema: getTriggerOrdersInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const adapter = resolveTriggerAdapter(ctx);
      const user = await resolveWalletAddressFromInput(input);
      if (!user) {
        throw new Error("Unable to resolve wallet address for getTriggerOrders");
      }

      const payload = await adapter.getTriggerOrders({
        user,
        orderStatus: input.orderStatus,
        page: input.page,
        includeFailedTx: input.includeFailedTx,
        inputMint: input.inputMint ? normalizeCoinToMint(input.inputMint, input.coinAliases) : undefined,
        outputMint: input.outputMint ? normalizeCoinToMint(input.outputMint, input.coinAliases) : undefined,
      });

      const rawOrders = Array.isArray(payload.orders) ? payload.orders : [];
      const totalPages = typeof payload.totalPages === "number" ? payload.totalPages : 1;
      const page = typeof payload.page === "number" ? payload.page : input.page;

      return {
        ok: true,
        retryable: false,
        data: {
          user,
          orderStatus: typeof payload.orderStatus === "string" ? payload.orderStatus : input.orderStatus,
          page,
          totalPages,
          hasMoreData: page < totalPages,
          orders: rawOrders.map((entry) => {
            const raw = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
            return {
              orderKey: toNullableString(raw.orderKey),
              userPubkey: toNullableString(raw.userPubkey),
              inputMint: toNullableString(raw.inputMint),
              outputMint: toNullableString(raw.outputMint),
              makingAmount: toNullableString(raw.makingAmount),
              takingAmount: toNullableString(raw.takingAmount),
              remainingMakingAmount: toNullableString(raw.remainingMakingAmount),
              remainingTakingAmount: toNullableString(raw.remainingTakingAmount),
              rawMakingAmount: toNullableString(raw.rawMakingAmount),
              rawTakingAmount: toNullableString(raw.rawTakingAmount),
              rawRemainingMakingAmount: toNullableString(raw.rawRemainingMakingAmount),
              rawRemainingTakingAmount: toNullableString(raw.rawRemainingTakingAmount),
              slippageBps: toNullableString(raw.slippageBps),
              expiredAt: toNullableString(raw.expiredAt),
              createdAt: toNullableString(raw.createdAt),
              updatedAt: toNullableString(raw.updatedAt),
              status: toNullableString(raw.status),
              openTx: toNullableString(raw.openTx),
              closeTx: toNullableString(raw.closeTx),
              derivedTriggerPrice: deriveOrderPrice(raw),
              raw,
            };
          }),
          raw: payload.raw && typeof payload.raw === "object" ? (payload.raw as Record<string, unknown>) : {},
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
        code: "GET_TRIGGER_ORDERS_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
