import type { Action } from "../../../../../ai/contracts/types/action";
import type { JupiterUltraExecuteResponse } from "../../../../lib/adapters/jupiter-ultra";

import {
  createActionFailure,
  createActionSuccess,
  getUltraAdapter,
  signOrderTransactionIfNeeded,
  ultraExecuteInputSchema,
} from "./shared";

export type UltraExecuteSwapInput = typeof ultraExecuteInputSchema._output;

export interface UltraExecuteSwapOutput {
  response: JupiterUltraExecuteResponse;
  requestId: string;
  signature?: string;
  status: string;
}

export const ultraExecuteSwapAction: Action<UltraExecuteSwapInput, UltraExecuteSwapOutput> = {
  name: "ultraExecuteSwap",
  category: "wallet-based",
  subcategory: "swap",
  inputSchema: ultraExecuteInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const ultra = getUltraAdapter(ctx);
      const signedTransaction = await signOrderTransactionIfNeeded(ctx, input);
      const response = await ultra.executeOrder({
        requestId: input.requestId,
        signedTransaction,
      });

      const signature = typeof response.signature === "string" ? response.signature : undefined;
      const status = typeof response.status === "string" ? response.status : "Unknown";

      const result = createActionSuccess(
        idempotencyKey,
        {
          response,
          requestId: input.requestId,
          signature,
          status,
        },
        signature,
      );

      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = createActionFailure<UltraExecuteSwapOutput>(
        idempotencyKey,
        message,
        true,
        "ULTRA_EXECUTE_FAILED",
      );
      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    }
  },
};
