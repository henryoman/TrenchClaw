import { z } from "zod";

import type { ActionContext } from "../../../../../ai/runtime/types/context";
import type { JupiterTriggerAdapter } from "../../../../lib/adapters/jupiter-trigger";
import {
  createActionFailure,
  createActionSuccess,
  getTakerFromContext,
  normalizeCoinToMint,
  resolveRawAmount,
  signOrderTransactionIfNeeded,
} from "../ultra/shared";

const SOL_MINT = "So11111111111111111111111111111111111111112";

type AmountUnit = "ui" | "native" | "percent";

interface TokenBalanceReader {
  getDecimals(mintAddress: string): Promise<number>;
}

interface TriggerContext extends ActionContext {
  jupiterTrigger?: JupiterTriggerAdapter;
  tokenAccounts?: TokenBalanceReader;
}

const amountSchema = z.union([z.number().positive(), z.string().trim().min(1)]);
const amountUnitSchema = z.enum(["ui", "native", "percent"]);
const limitPriceSchema = z.union([z.number().positive(), z.string().trim().min(1)]);

export const triggerCreateOrderInputSchema = z
  .object({
    inputCoin: z.string().min(1),
    outputCoin: z.string().min(1),
    makingAmount: amountSchema,
    makingAmountUnit: amountUnitSchema.optional(),
    takingAmount: amountSchema.optional(),
    takingAmountUnit: z.enum(["ui", "native"]).optional(),
    limitPrice: limitPriceSchema.optional(),
    maker: z.string().min(1).optional(),
    payer: z.string().min(1).optional(),
    coinAliases: z.record(z.string(), z.string()).optional(),
    feeAccount: z.string().min(1).optional(),
    feeBps: z.number().int().positive().max(10_000).optional(),
    slippageBps: z.number().int().nonnegative().max(10_000).optional(),
    expiredAtUnixSeconds: z.number().int().positive().optional(),
    computeUnitPrice: z.union([z.literal("auto"), z.number().int().positive(), z.string().trim().min(1)]).optional(),
    wrapAndUnwrapSol: z.boolean().optional(),
  })
  .superRefine((input, refinementCtx) => {
    const hasTakingAmount = input.takingAmount !== undefined;
    const hasLimitPrice = input.limitPrice !== undefined;

    if (hasTakingAmount === hasLimitPrice) {
      refinementCtx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of "takingAmount" or "limitPrice".',
        path: hasTakingAmount ? ["takingAmount"] : ["limitPrice"],
      });
    }
  });

export const triggerGetOrdersInputSchema = z.object({
  user: z.string().min(1).optional(),
  orderStatus: z.enum(["active", "history"]).default("active"),
  page: z.number().int().positive().optional(),
  inputCoin: z.string().min(1).optional(),
  outputCoin: z.string().min(1).optional(),
  includeFailedTx: z.boolean().optional(),
  coinAliases: z.record(z.string(), z.string()).optional(),
});

export const triggerCancelOrdersInputSchema = z
  .object({
    maker: z.string().min(1).optional(),
    order: z.string().min(1).optional(),
    orders: z.array(z.string().min(1)).min(1).optional(),
    computeUnitPrice: z.union([z.literal("auto"), z.number().int().positive(), z.string().trim().min(1)]).optional(),
  })
  .superRefine((input, refinementCtx) => {
    if (!input.order && (!input.orders || input.orders.length === 0)) {
      refinementCtx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide "order" or "orders" to cancel.',
        path: ["orders"],
      });
    }
  });

export type TriggerCreateOrderInput = z.output<typeof triggerCreateOrderInputSchema>;
export type TriggerGetOrdersInput = z.output<typeof triggerGetOrdersInputSchema>;
export type TriggerCancelOrdersInput = z.output<typeof triggerCancelOrdersInputSchema>;

export {
  createActionFailure,
  createActionSuccess,
  getTakerFromContext,
  normalizeCoinToMint,
  signOrderTransactionIfNeeded,
};

export const getTriggerAdapter = (ctx: ActionContext): JupiterTriggerAdapter => {
  const trigger = (ctx as TriggerContext).jupiterTrigger;
  if (!trigger) {
    throw new Error("Missing Jupiter Trigger adapter in action context (ctx.jupiterTrigger)");
  }
  return trigger;
};

const getTokenReader = (ctx: ActionContext): TokenBalanceReader => {
  const tokenAccounts = (ctx as TriggerContext).tokenAccounts;
  if (!tokenAccounts) {
    throw new Error("Missing token account adapter in action context (ctx.tokenAccounts)");
  }
  return tokenAccounts;
};

const getDecimals = async (ctx: ActionContext, mintAddress: string): Promise<number> => {
  if (mintAddress === SOL_MINT) {
    return 9;
  }
  return getTokenReader(ctx).getDecimals(mintAddress);
};

const parsePositiveDecimal = (value: number | string): { numerator: bigint; scale: bigint; normalized: string } => {
  const raw = String(value).trim();
  if (!raw || !/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid limit price: "${value}"`);
  }

  const [wholePart = "", fractionalPart = ""] = raw.split(".");
  const normalizedWhole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  const normalizedFraction = fractionalPart.replace(/0+$/, "");
  const normalized = normalizedFraction.length > 0 ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
  const digits = `${normalizedWhole}${normalizedFraction}`;
  const numerator = BigInt(digits);
  const scale = 10n ** BigInt(normalizedFraction.length);

  if (numerator <= 0n) {
    throw new Error(`Invalid limit price: "${value}"`);
  }

  return {
    numerator,
    scale,
    normalized,
  };
};

const ceilDiv = (numerator: bigint, denominator: bigint): bigint => {
  if (denominator <= 0n) {
    throw new Error("Division denominator must be positive");
  }
  return (numerator + denominator - 1n) / denominator;
};

const buildTakingAmountFromLimitPrice = async (
  ctx: ActionContext,
  inputMint: string,
  outputMint: string,
  makingAmountRaw: bigint,
  limitPrice: number | string,
): Promise<{ takingAmountRaw: bigint; limitPrice: string }> => {
  const parsedPrice = parsePositiveDecimal(limitPrice);
  const inputDecimals = await getDecimals(ctx, inputMint);
  const outputDecimals = await getDecimals(ctx, outputMint);

  const numerator =
    makingAmountRaw * parsedPrice.numerator * 10n ** BigInt(outputDecimals);
  const denominator = parsedPrice.scale * 10n ** BigInt(inputDecimals);
  const takingAmountRaw = ceilDiv(numerator, denominator);

  if (takingAmountRaw <= 0n) {
    throw new Error("Computed taking amount must be positive");
  }

  return {
    takingAmountRaw,
    limitPrice: parsedPrice.normalized,
  };
};

export const buildTriggerCreateOrderRequest = async (
  ctx: ActionContext,
  input: TriggerCreateOrderInput,
): Promise<{
  request: {
    inputMint: string;
    outputMint: string;
    maker: string;
    payer: string;
    params: {
      makingAmount: string;
      takingAmount: string;
      expiredAt?: number;
      slippageBps?: number;
      feeBps?: number;
    };
    computeUnitPrice?: "auto" | string | number;
    feeAccount?: string;
    wrapAndUnwrapSol?: boolean;
  };
  preview: {
    inputMint: string;
    outputMint: string;
    maker: string;
    payer: string;
    makingAmount: string;
    takingAmount: string;
    limitPrice?: string;
  };
}> => {
  const inputMint = normalizeCoinToMint(input.inputCoin, input.coinAliases);
  const outputMint = normalizeCoinToMint(input.outputCoin, input.coinAliases);
  const maker = input.maker ?? getTakerFromContext(ctx);
  const payer = input.payer ?? maker;

  if (!maker) {
    throw new Error("Missing maker wallet address. Provide input.maker or a signer-backed context wallet.");
  }
  if (!payer) {
    throw new Error("Missing payer wallet address. Provide input.payer or a signer-backed context wallet.");
  }

  const makingAmountRaw = await resolveRawAmount(
    ctx,
    inputMint,
    maker,
    input.makingAmount,
    input.makingAmountUnit as AmountUnit | undefined,
  );

  const takingAmountResolved =
    input.takingAmount !== undefined
      ? {
          takingAmountRaw: await resolveRawAmount(
            ctx,
            outputMint,
            maker,
            input.takingAmount,
            input.takingAmountUnit,
          ),
          limitPrice: undefined,
        }
      : await buildTakingAmountFromLimitPrice(ctx, inputMint, outputMint, makingAmountRaw, input.limitPrice!);

  return {
    request: {
      inputMint,
      outputMint,
      maker,
      payer,
      params: {
        makingAmount: makingAmountRaw.toString(10),
        takingAmount: takingAmountResolved.takingAmountRaw.toString(10),
        ...(input.expiredAtUnixSeconds === undefined ? {} : { expiredAt: input.expiredAtUnixSeconds }),
        ...(input.slippageBps === undefined ? {} : { slippageBps: input.slippageBps }),
        ...(input.feeBps === undefined ? {} : { feeBps: input.feeBps }),
      },
      ...(input.computeUnitPrice === undefined ? {} : { computeUnitPrice: input.computeUnitPrice }),
      ...(input.feeAccount ? { feeAccount: input.feeAccount } : {}),
      ...(input.wrapAndUnwrapSol === undefined ? {} : { wrapAndUnwrapSol: input.wrapAndUnwrapSol }),
    },
    preview: {
      inputMint,
      outputMint,
      maker,
      payer,
      makingAmount: makingAmountRaw.toString(10),
      takingAmount: takingAmountResolved.takingAmountRaw.toString(10),
      ...(takingAmountResolved.limitPrice ? { limitPrice: takingAmountResolved.limitPrice } : {}),
    },
  };
};
