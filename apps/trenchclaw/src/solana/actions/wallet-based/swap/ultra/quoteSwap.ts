import type { Action } from "../../../../../ai/runtime/types/action";
import type { JupiterUltraOrderResponse } from "../../../../lib/adapters/jupiter-ultra";

import {
  buildOrderRequest,
  createActionFailure,
  createActionSuccess,
  getUltraAdapter,
  ultraQuoteInputSchema,
} from "./shared";

export type UltraQuoteSwapInput = typeof ultraQuoteInputSchema._output;

export interface UltraQuoteSwapOutput {
  order: JupiterUltraOrderResponse;
  request: {
    inputMint: string;
    outputMint: string;
    amount: string;
    taker?: string;
    mode?: "ExactIn" | "ExactOut";
  };
}

export const ultraQuoteSwapAction: Action<UltraQuoteSwapInput, UltraQuoteSwapOutput> = {
  name: "ultraQuoteSwap",
  category: "wallet-based",
  subcategory: "swap",
  inputSchema: ultraQuoteInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const ultra = getUltraAdapter(ctx);
      const orderRequest = await buildOrderRequest(ctx, input);
      const order = await ultra.getOrder(orderRequest);
      if (!order.transaction && orderRequest.taker) {
        const orderRecord = order.raw && typeof order.raw === "object" ? (order.raw as Record<string, unknown>) : {};
        const errorCode = typeof orderRecord.errorCode === "number" ? orderRecord.errorCode : undefined;
        const errorMessage =
          typeof orderRecord.errorMessage === "string" && orderRecord.errorMessage.trim().length > 0
            ? orderRecord.errorMessage.trim()
            : typeof orderRecord.error === "string" && orderRecord.error.trim().length > 0
              ? orderRecord.error.trim()
              : "Ultra order did not return a signable transaction.";
        const suffix = errorCode !== undefined ? ` (errorCode ${errorCode})` : "";
        throw new Error(`${errorMessage}${suffix}`);
      }

      const result = createActionSuccess(idempotencyKey, {
        order,
        request: {
          inputMint: orderRequest.inputMint,
          outputMint: orderRequest.outputMint,
          amount: String(orderRequest.amount),
          taker: orderRequest.taker,
          mode: orderRequest.mode,
        },
      });

      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = createActionFailure<UltraQuoteSwapOutput>(
        idempotencyKey,
        message,
        false,
        "ULTRA_QUOTE_FAILED",
      );
      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    }
  },
};
