import { z } from "zod";

import type { Action } from "../../../../../ai/runtime/types/action";
import type { ActionContext } from "../../../../../ai/runtime/types/context";
import type { JupiterBuildRequest, JupiterSwapAdapter } from "../../../../lib/adapters/jupiter";
import {
  createActionFailure,
  createActionSuccess,
  getTakerFromContext,
  normalizeCoinToMint,
  resolveRawAmount,
  ultraQuoteInputSchema,
} from "../ultra/shared";

interface StandardQuoteContext extends ActionContext {
  jupiter?: JupiterSwapAdapter;
}

const standardQuoteInputSchema = ultraQuoteInputSchema.extend({
  slippageBps: z.number().int().min(0).max(10_000).optional(),
});

type StandardQuoteInput = z.output<typeof standardQuoteInputSchema>;

export interface StandardQuoteSwapOutput {
  build: Record<string, unknown>;
  request: JupiterBuildRequest;
}

const getJupiterAdapter = (ctx: ActionContext): JupiterSwapAdapter => {
  const adapter = (ctx as StandardQuoteContext).jupiter;
  if (!adapter) {
    throw new Error("Missing Jupiter Swap API adapter in action context (ctx.jupiter)");
  }
  return adapter;
};

export const quoteSwapAction: Action<StandardQuoteInput, StandardQuoteSwapOutput> = {
  name: "quoteSwap",
  category: "wallet-based",
  subcategory: "swap",
  inputSchema: standardQuoteInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      if (input.mode === "ExactOut") {
        throw new Error("Jupiter Swap API /build is currently wired only for ExactIn managed swaps.");
      }
      if (input.referralAccount || typeof input.referralFee === "number") {
        throw new Error("Jupiter standard swaps do not support Ultra referral parameters on the managed swap surface.");
      }

      const adapter = getJupiterAdapter(ctx);
      const taker = input.taker ?? getTakerFromContext(ctx);
      if (!taker) {
        throw new Error("A taker wallet address is required for Jupiter standard quotes.");
      }

      const inputMint = normalizeCoinToMint(input.inputCoin, input.coinAliases);
      const outputMint = normalizeCoinToMint(input.outputCoin, input.coinAliases);
      const rawAmount = await resolveRawAmount(ctx, inputMint, taker, input.amount, input.amountUnit);
      const request: JupiterBuildRequest = {
        inputMint,
        outputMint,
        amount: rawAmount.toString(10),
        taker,
        slippageBps: input.slippageBps ?? 50,
      };
      const build = await adapter.buildSwap(request);

      return {
        ...createActionSuccess(idempotencyKey, {
          build: build.raw && typeof build.raw === "object" ? build.raw as Record<string, unknown> : {},
          request,
        }),
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...createActionFailure<StandardQuoteSwapOutput>(
          idempotencyKey,
          message,
          false,
          "STANDARD_QUOTE_FAILED",
        ),
        durationMs: Date.now() - startedAt,
      };
    }
  },
};
