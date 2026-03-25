import { performance } from "node:perf_hooks";
import { z } from "zod";

import type { Action } from "../../../ai/contracts/types/action";

import {
  createActionFailure,
  createActionSuccess,
  buildOrderRequest,
  getUltraAdapter,
  signOrderTransactionIfNeeded,
  ultraQuoteInputSchema,
} from "./shared";
import { registerTransactionForConfirmation } from "./confirmationTracker";
import {
  extractFeeBps,
  extractInAmount,
  extractOutAmount,
  extractPrioritizationFee,
  extractRentFee,
  resolveRequestId,
  extractSignatureFee,
  extractSignatureFromSignedTransaction,
  roundTimings,
  type UltraPhaseTimings,
} from "../../../solana/lib/jupiter/parsing";

const ultraSwapInputSchema = ultraQuoteInputSchema.extend({
  executeTimeoutMs: z.number().int().positive().max(60_000).optional(),
});

export type UltraSwapInput = typeof ultraSwapInputSchema._output;

export interface UltraSwapTelemetry {
  requestId: string;
  walletAddress?: string;
  inputMint: string;
  outputMint: string;
  amountLamports: string;
  slippageStrategy: "ultra-managed";
  feeStrategy: "ultra-managed";
  quoteInAmount?: string;
  quoteOutAmount?: string;
  outAmount?: string;
  feeBps?: number;
  prioritizationFeeLamports?: number;
  signatureFeeLamports?: number;
  rentFeeLamports?: number;
  note?: string;
  timings: UltraPhaseTimings;
}

export interface UltraSwapOutput {
  requestId: string;
  signature?: string;
  status: string;
  outAmount?: string;
  feeBps?: number;
  order: Record<string, unknown>;
  execute?: Record<string, unknown>;
  telemetry: UltraSwapTelemetry;
}

export const ultraSwapAction: Action<UltraSwapInput, UltraSwapOutput> = {
  name: "ultraSwap",
  category: "wallet-based",
  subcategory: "swap",
  inputSchema: ultraSwapInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    const timings: UltraPhaseTimings = {
      orderMs: 0,
      signingMs: 0,
      submitMs: 0,
      totalMs: 0,
    };

    const timingStart = performance.now();
    const executeTimeoutMs = input.executeTimeoutMs ?? 5_000;

    try {
      const ultra = getUltraAdapter(ctx);
      const orderRequest = await buildOrderRequest(ctx, input);
      orderRequest.swapMode = orderRequest.mode ?? "ExactIn";

      const orderPhaseStart = performance.now();
      const order = await ultra.getOrder(orderRequest);
      timings.orderMs = performance.now() - orderPhaseStart;

      const requestId = resolveRequestId(order.raw) ?? order.requestId;
      if (!requestId) {
        throw new Error("Ultra order response missing requestId");
      }
      if (!order.transaction) {
        const orderRecord = toRecord(order.raw);
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

      const signingPhaseStart = performance.now();
      const signedTransaction = await signOrderTransactionIfNeeded(ctx, {
        requestId,
        transaction: order.transaction,
      });
      timings.signingMs = performance.now() - signingPhaseStart;

      const signature = extractSignatureFromSignedTransaction(signedTransaction);
      const executePayload = {
        requestId,
        signedTransaction,
      };

      const submitPhaseStart = performance.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), executeTimeoutMs);

      try {
        const execute = await ultra.executeOrder(executePayload, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        timings.submitMs = performance.now() - submitPhaseStart;
        timings.totalMs = performance.now() - timingStart;

        const outAmount = extractOutAmount(execute.raw) ?? extractOutAmount(order.raw);
        const feeBps = extractFeeBps(execute.raw) ?? extractFeeBps(order.raw);

        if (signature) {
          registerTransactionForConfirmation({
            signature,
            requestId,
            rpcUrl: ctx.rpcUrl,
            metadata: {
              idempotencyKey,
            },
          });
        }

        const telemetry = buildSwapTelemetry({
          requestId,
          walletAddress: orderRequest.taker,
          order,
          execute,
          orderRequest,
          timings,
        });

        const result = createActionSuccess(
          idempotencyKey,
          {
            requestId,
            signature,
            status: execute.status,
            outAmount,
            feeBps,
            order: toRecord(order.raw),
            execute: toRecord(execute.raw),
            telemetry,
          },
          signature,
        );

        return {
          ...result,
          durationMs: Date.now() - startedAt,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        timings.submitMs = timings.submitMs || performance.now() - submitPhaseStart;
        timings.totalMs = performance.now() - timingStart;

        if (error instanceof Error && error.name === "AbortError") {
          if (signature) {
            registerTransactionForConfirmation({
              signature,
              requestId,
              rpcUrl: ctx.rpcUrl,
              metadata: {
                idempotencyKey,
                note: "execute-timeout",
              },
            });
          }

          const telemetry = buildSwapTelemetry({
            requestId,
            walletAddress: orderRequest.taker,
            order,
            execute: undefined,
            orderRequest,
            timings,
            note: "execute-timeout",
          });

          const result = createActionSuccess(
            idempotencyKey,
            {
              requestId,
              signature,
              status: "PendingTimeout",
              order: toRecord(order.raw),
              telemetry,
            },
            signature,
          );

          return {
            ...result,
            durationMs: Date.now() - startedAt,
          };
        }

        throw error;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = createActionFailure<UltraSwapOutput>(
        idempotencyKey,
        message,
        true,
        "ULTRA_SWAP_FAILED",
      );
      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    }
  },
};

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as Record<string, unknown>;
}

function buildSwapTelemetry(params: {
  requestId: string;
  walletAddress?: string;
  order: { raw: unknown };
  execute?: { raw: unknown };
  orderRequest: { inputMint: string; outputMint: string; amount: string | number | bigint };
  timings: UltraPhaseTimings;
  note?: string;
}): UltraSwapTelemetry {
  const quotePayload = params.order.raw;
  const executePayload = params.execute?.raw;

  return {
    requestId: params.requestId,
    walletAddress: params.walletAddress,
    inputMint: params.orderRequest.inputMint,
    outputMint: params.orderRequest.outputMint,
    amountLamports: String(params.orderRequest.amount),
    slippageStrategy: "ultra-managed",
    feeStrategy: "ultra-managed",
    quoteInAmount: extractInAmount(quotePayload),
    quoteOutAmount: extractOutAmount(quotePayload),
    outAmount: extractOutAmount(executePayload),
    feeBps: extractFeeBps(executePayload),
    prioritizationFeeLamports: extractPrioritizationFee(executePayload),
    signatureFeeLamports: extractSignatureFee(executePayload),
    rentFeeLamports: extractRentFee(executePayload),
    note: params.note,
    timings: roundTimings(params.timings),
  };
}
