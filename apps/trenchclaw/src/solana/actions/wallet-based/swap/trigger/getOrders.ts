import type { Action } from "../../../../../ai/runtime/types/action";

import { createActionFailure, createActionSuccess, getTakerFromContext, getTriggerAdapter, normalizeCoinToMint, triggerGetOrdersInputSchema, type TriggerGetOrdersInput } from "./shared";

export interface TriggerGetOrdersOutput {
  user: string;
  orderStatus: "active" | "history";
  page: number;
  hasMoreData: boolean;
  inputMint?: string;
  outputMint?: string;
  orders: unknown[];
  response: Record<string, unknown>;
}

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

export const getTriggerOrdersAction: Action<TriggerGetOrdersInput, TriggerGetOrdersOutput> = {
  name: "getTriggerOrders",
  category: "wallet-based",
  subcategory: "trigger",
  inputSchema: triggerGetOrdersInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const trigger = getTriggerAdapter(ctx);
      const user = input.user ?? getTakerFromContext(ctx);
      if (!user) {
        throw new Error("Missing user wallet address. Provide input.user or a signer-backed context wallet.");
      }

      const inputMint = input.inputCoin ? normalizeCoinToMint(input.inputCoin, input.coinAliases) : undefined;
      const outputMint = input.outputCoin ? normalizeCoinToMint(input.outputCoin, input.coinAliases) : undefined;
      const response = await trigger.getTriggerOrders({
        user,
        orderStatus: input.orderStatus,
        page: input.page,
        inputMint,
        outputMint,
        includeFailedTx: input.includeFailedTx,
      });

      const result = createActionSuccess(idempotencyKey, {
        user,
        orderStatus: input.orderStatus,
        page: response.page,
        hasMoreData: response.hasMoreData,
        inputMint,
        outputMint,
        orders: response.orders,
        response: toRecord(response.raw),
      });

      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const result = createActionFailure<TriggerGetOrdersOutput>(
        idempotencyKey,
        error instanceof Error ? error.message : String(error),
        false,
        "TRIGGER_GET_ORDERS_FAILED",
      );
      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    }
  },
};
