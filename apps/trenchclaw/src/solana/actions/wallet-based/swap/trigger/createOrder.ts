import { performance } from "node:perf_hooks";
import { z } from "zod";

import type { Action } from "../../../../../ai/runtime/types/action";
import { normalizeCoinToMint } from "../ultra/shared";
import {
  triggerBasisSourceSchema,
  triggerDirectionSchema,
  triggerSpecSchema,
  resolveDerivedTriggerPrice,
  buildMakingAndTakingAmounts,
  createActionFailure,
  createActionSuccess,
  resolveMakerAddress,
  resolveTriggerAdapter,
  signTriggerTransactionIfNeeded,
} from "./shared";

const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

const triggerOrderInputSchema = z.object({
  maker: z.string().trim().min(1).optional(),
  payer: z.string().trim().min(1).optional(),
  inputCoin: z.string().trim().min(1),
  outputCoin: z.string().trim().min(1),
  amount: z.union([z.number().positive(), z.string().trim().min(1)]),
  amountUnit: z.enum(["ui", "native", "percent"]).optional(),
  direction: triggerDirectionSchema,
  trigger: triggerSpecSchema,
  buyPrice: z.union([z.number().positive(), z.string().trim().min(1)]).optional(),
  buyPriceSource: triggerBasisSourceSchema.optional(),
  coinAliases: z.record(z.string(), z.string()).optional(),
  computeUnitPrice: z.string().trim().min(1).optional(),
  expiresAtUnixMs: z.number().int().positive().optional(),
  signedTransaction: z.string().trim().min(1).optional(),
  transaction: z.string().trim().min(1).optional(),
});

export type TriggerOrderInput = z.output<typeof triggerOrderInputSchema>;

export interface TriggerOrderOutput {
  requestId: string;
  order: string;
  signature?: string;
  status: string;
  tracking: {
    action: "getTriggerOrders";
    user: string;
    orderStatus: "active";
    order: string;
  };
  maker: string;
  inputMint: string;
  outputMint: string;
  makingAmount: string;
  takingAmount: string;
  derivedTriggerPrice: string;
  derivedBuyPrice?: string;
  triggerMode: "exactPrice" | "percentFromBuyPrice";
  direction: z.infer<typeof triggerDirectionSchema>;
  execute?: Record<string, unknown>;
  telemetry: {
    requestId: string;
    maker: string;
    inputMint: string;
    outputMint: string;
    makingAmount: string;
    takingAmount: string;
    derivedTriggerPrice: string;
    derivedBuyPrice?: string;
    triggerMode: "exactPrice" | "percentFromBuyPrice";
    direction: z.infer<typeof triggerDirectionSchema>;
    timings: {
      createOrderMs: number;
      signingMs: number;
      executeMs: number;
      totalMs: number;
    };
  };
}

export const triggerOrderAction: Action<TriggerOrderInput, TriggerOrderOutput> = {
  name: "triggerOrder",
  category: "wallet-based",
  subcategory: "swap",
  inputSchema: triggerOrderInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();
    const timings = {
      createOrderMs: 0,
      signingMs: 0,
      executeMs: 0,
      totalMs: 0,
    };

    try {
      const adapter = resolveTriggerAdapter(ctx);
      const maker = resolveMakerAddress(ctx, input);
      const payer = input.payer?.trim() || maker;
      const normalizedInputMint = normalizeCoinToMint(input.inputCoin, input.coinAliases);
      const normalizedOutputMint = normalizeCoinToMint(input.outputCoin, input.coinAliases);

      const triggerPrice = await resolveDerivedTriggerPrice({
        ctx,
        walletAddress: maker,
        inputMint: normalizedInputMint,
        outputMint: normalizedOutputMint,
        direction: input.direction,
        trigger: input.trigger,
        buyPrice: input.buyPrice,
        buyPriceSource: input.buyPriceSource,
      });

      const amounts = await buildMakingAndTakingAmounts({
        ctx,
        inputCoin: input.inputCoin,
        outputCoin: input.outputCoin,
        amount: input.amount,
        amountUnit: input.amountUnit,
        coinAliases: input.coinAliases,
        walletAddress: maker,
        triggerPrice: triggerPrice.triggerPrice,
      });

      const createStartedAt = performance.now();
      const order = await adapter.createOrder({
        maker,
        payer,
        inputMint: amounts.inputMint,
        outputMint: amounts.outputMint,
        params: {
          makingAmount: amounts.makingAmount,
          takingAmount: amounts.takingAmount,
          ...(input.expiresAtUnixMs ? { expiredAt: Math.max(1, Math.trunc(input.expiresAtUnixMs / 1000)) } : {}),
        },
        computeUnitPrice: input.computeUnitPrice ?? "auto",
        ...(amounts.inputMint === NATIVE_SOL_MINT ? { wrapAndUnwrapSol: true } : {}),
      });
      timings.createOrderMs = performance.now() - createStartedAt;

      const signingStartedAt = performance.now();
      const signedTransaction = await signTriggerTransactionIfNeeded(ctx, {
        signedTransaction: input.signedTransaction,
        transaction: input.transaction ?? order.transaction,
      });
      timings.signingMs = performance.now() - signingStartedAt;

      const executeStartedAt = performance.now();
      const execute = await adapter.executeOrder({
        requestId: order.requestId,
        signedTransaction,
      });
      timings.executeMs = performance.now() - executeStartedAt;
      timings.totalMs = performance.now() - createStartedAt;

      const result = createActionSuccess<TriggerOrderOutput>(
        idempotencyKey,
        {
          requestId: order.requestId,
          order: order.order,
          signature: execute.signature,
          status: execute.status,
          tracking: {
            action: "getTriggerOrders",
            user: maker,
            orderStatus: "active",
            order: order.order,
          },
          maker,
          inputMint: amounts.inputMint,
          outputMint: amounts.outputMint,
          makingAmount: amounts.makingAmount,
          takingAmount: amounts.takingAmount,
          derivedTriggerPrice: triggerPrice.triggerPrice,
          derivedBuyPrice: triggerPrice.buyPrice,
          triggerMode: triggerPrice.triggerMode,
          direction: input.direction,
          execute: execute.raw && typeof execute.raw === "object" ? (execute.raw as Record<string, unknown>) : undefined,
          telemetry: {
            requestId: order.requestId,
            maker,
            inputMint: amounts.inputMint,
            outputMint: amounts.outputMint,
            makingAmount: amounts.makingAmount,
            takingAmount: amounts.takingAmount,
            derivedTriggerPrice: triggerPrice.triggerPrice,
            derivedBuyPrice: triggerPrice.buyPrice,
            triggerMode: triggerPrice.triggerMode,
            direction: input.direction,
            timings: {
              createOrderMs: Math.max(0, Math.round(timings.createOrderMs)),
              signingMs: Math.max(0, Math.round(timings.signingMs)),
              executeMs: Math.max(0, Math.round(timings.executeMs)),
              totalMs: Math.max(0, Math.round(timings.totalMs)),
            },
          },
        },
        execute.signature,
      );

      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const result = createActionFailure<TriggerOrderOutput>(
        idempotencyKey,
        error instanceof Error ? error.message : String(error),
        false,
        "TRIGGER_ORDER_FAILED",
      );
      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    }
  },
};
