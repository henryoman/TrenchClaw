import type { Action } from "../../../../../ai/runtime/types/action";

import { createActionFailure, createActionSuccess, getTakerFromContext, getTriggerAdapter, signOrderTransactionIfNeeded, triggerCancelOrdersInputSchema, type TriggerCancelOrdersInput } from "./shared";

export interface TriggerCancelOrdersOutput {
  requestId: string;
  maker: string;
  orders: string[];
  statuses: string[];
  signatures: string[];
  responseCount: number;
  responses: Record<string, unknown>[];
}

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const normalizeOrders = (input: TriggerCancelOrdersInput): string[] =>
  input.order ? [input.order] : (input.orders ?? []);

export const triggerCancelOrdersAction: Action<TriggerCancelOrdersInput, TriggerCancelOrdersOutput> = {
  name: "triggerCancelOrders",
  category: "wallet-based",
  subcategory: "trigger",
  inputSchema: triggerCancelOrdersInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const trigger = getTriggerAdapter(ctx);
      const maker = input.maker ?? getTakerFromContext(ctx);
      if (!maker) {
        throw new Error("Missing maker wallet address. Provide input.maker or a signer-backed context wallet.");
      }

      const orders = normalizeOrders(input);
      const cancelResponse =
        orders.length === 1
          ? await (async () => {
              const response = await trigger.cancelOrder({
                maker,
                order: orders[0]!,
                computeUnitPrice: input.computeUnitPrice,
              });
              return {
                requestId: response.requestId,
                transactions: [response.transaction],
              };
            })()
          : await trigger.cancelOrders({
              maker,
              orders,
              computeUnitPrice: input.computeUnitPrice,
            });

      const signatures: string[] = [];
      const statuses: string[] = [];
      const responses: Record<string, unknown>[] = [];

      for (const transaction of cancelResponse.transactions) {
        const signedTransaction = await signOrderTransactionIfNeeded(ctx, {
          requestId: cancelResponse.requestId,
          transaction,
        });
        const execute = await trigger.executeOrder({
          requestId: cancelResponse.requestId,
          signedTransaction,
        });
        if (typeof execute.signature === "string") {
          signatures.push(execute.signature);
        }
        statuses.push(typeof execute.status === "string" ? execute.status : "Unknown");
        responses.push(toRecord(execute.raw));
      }

      const result = createActionSuccess(
        idempotencyKey,
        {
          requestId: cancelResponse.requestId,
          maker,
          orders,
          statuses,
          signatures,
          responseCount: responses.length,
          responses,
        },
        signatures[0],
      );

      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const result = createActionFailure<TriggerCancelOrdersOutput>(
        idempotencyKey,
        error instanceof Error ? error.message : String(error),
        true,
        "TRIGGER_CANCEL_ORDERS_FAILED",
      );
      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    }
  },
};
