import type { Action } from "../../../../../ai/runtime/types/action";

import { buildTriggerCreateOrderRequest, createActionFailure, createActionSuccess, getTriggerAdapter, signOrderTransactionIfNeeded, triggerCreateOrderInputSchema, type TriggerCreateOrderInput } from "./shared";

export interface TriggerOrderOutput {
  requestId: string;
  order?: string;
  signature?: string;
  status: string;
  request: {
    inputMint: string;
    outputMint: string;
    maker: string;
    payer: string;
    makingAmount: string;
    takingAmount: string;
    limitPrice?: string;
  };
  create: Record<string, unknown>;
  execute: Record<string, unknown>;
}

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

export const triggerOrderAction: Action<TriggerCreateOrderInput, TriggerOrderOutput> = {
  name: "triggerOrder",
  category: "wallet-based",
  subcategory: "trigger",
  inputSchema: triggerCreateOrderInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const trigger = getTriggerAdapter(ctx);
      const { request, preview } = await buildTriggerCreateOrderRequest(ctx, input);
      const create = await trigger.createOrder(request);
      const signedTransaction = await signOrderTransactionIfNeeded(ctx, {
        requestId: create.requestId,
        transaction: create.transaction,
      });
      const execute = await trigger.executeOrder({
        requestId: create.requestId,
        signedTransaction,
      });

      const signature = typeof execute.signature === "string" ? execute.signature : undefined;
      const status = typeof execute.status === "string" ? execute.status : "Unknown";

      const result = createActionSuccess(
        idempotencyKey,
        {
          requestId: create.requestId,
          order: create.order,
          signature,
          status,
          request: preview,
          create: toRecord(create.raw),
          execute: toRecord(execute.raw),
        },
        signature,
      );

      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const result = createActionFailure<TriggerOrderOutput>(
        idempotencyKey,
        error instanceof Error ? error.message : String(error),
        true,
        "TRIGGER_ORDER_FAILED",
      );
      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    }
  },
};
