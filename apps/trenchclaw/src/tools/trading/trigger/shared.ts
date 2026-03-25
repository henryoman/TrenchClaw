import { createHelius } from "helius-sdk";
import { z } from "zod";

import type { ActionContext } from "../../../ai/contracts/types/context";
import type { ActionResult } from "../../../ai/contracts/types/action";
import type { StateStore } from "../../../ai/contracts/types/state";
import {
  createJupiterTriggerAdapterFromConfig,
  type JupiterTriggerAdapter,
} from "../../../solana/lib/jupiter/trigger";
import { resolveHeliusRpcConfig } from "../../../solana/lib/rpc/helius";
import { findManagedWalletEntryBySelection } from "../../../solana/lib/wallet/walletSelector";
import {
  createActionFailure,
  createActionSuccess,
  getTakerFromContext,
  normalizeCoinToMint,
  resolveRawAmount,
  signOrderTransactionIfNeeded,
} from "../ultra/shared";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const MAX_RECEIPT_SCAN = 50;
const MAX_HELIUS_HISTORY = 30;

export const triggerDirectionSchema = z.enum([
  "sellAbove",
  "sellBelow",
  "buyAbove",
  "buyBelow",
]);

const decimalStringSchema = z.union([z.number().positive(), z.string().trim().min(1)]);

export const triggerSpecSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("exactPrice"),
    price: decimalStringSchema,
  }),
  z.object({
    kind: z.literal("percentFromBuyPrice"),
    percent: z.number().positive(),
  }),
]);

export const triggerBasisSourceSchema = z.enum(["auto-last-buy", "explicit"]);

export interface TriggerDerivedPriceResolution {
  triggerPrice: string;
  buyPrice?: string;
  triggerMode: "exactPrice" | "percentFromBuyPrice";
}

interface TriggerContext extends ActionContext {
  jupiterTrigger?: JupiterTriggerAdapter;
  ultraSigner?: {
    address?: string;
    signBase64Transaction: (base64Transaction: string) => Promise<string>;
  };
  stateStore?: StateStore;
}

interface ReceiptSwapCandidate {
  walletAddress: string;
  inputMint: string;
  outputMint: string;
  inputRawAmount: bigint;
  inputDecimals: number;
  outputRawAmount: bigint;
  outputDecimals: number;
}

interface HeliusSwapSide {
  mint: string;
  rawAmount: bigint;
  decimals: number;
}

interface HeliusEnhancedTransaction {
  signature: string;
  events?: {
    swap?: {
      nativeInput?: {
        amount?: string;
        mint?: string;
      };
      nativeOutput?: {
        amount?: string;
        mint?: string;
      };
      tokenInputs?: Array<{
        mint?: string;
        rawTokenAmount?: {
          tokenAmount?: string;
          decimals?: number;
        };
      }>;
      tokenOutputs?: Array<{
        mint?: string;
        rawTokenAmount?: {
          tokenAmount?: string;
          decimals?: number;
        };
      }>;
    };
  };
}

type HeliusSwapEvent = NonNullable<NonNullable<HeliusEnhancedTransaction["events"]>["swap"]>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const numberToPlainString = (value: number): string => {
  const raw = value.toString();
  if (!/[eE]/.test(raw)) {
    return raw;
  }

  const normalizedRaw = raw.toLowerCase();
  const exponentMarkerIndex = normalizedRaw.indexOf("e");
  const mantissa = exponentMarkerIndex >= 0 ? normalizedRaw.slice(0, exponentMarkerIndex) : normalizedRaw;
  const exponentPart = exponentMarkerIndex >= 0 ? normalizedRaw.slice(exponentMarkerIndex + 1) || "0" : "0";
  const exponent = Number(exponentPart);
  if (!Number.isInteger(exponent)) {
    throw new Error(`Unable to normalize numeric value "${raw}"`);
  }

  const negative = mantissa.startsWith("-");
  const unsignedMantissa = negative ? mantissa.slice(1) : mantissa;
  const [whole = "0", fraction = ""] = unsignedMantissa.split(".");
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  const decimalIndex = whole.length + exponent;

  if (decimalIndex <= 0) {
    return `${negative ? "-" : ""}0.${"0".repeat(-decimalIndex)}${digits}`;
  }
  if (decimalIndex >= digits.length) {
    return `${negative ? "-" : ""}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  }
  return `${negative ? "-" : ""}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
};

const normalizePositiveDecimal = (value: string | number): string => {
  const raw = typeof value === "number" ? numberToPlainString(value) : value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid positive decimal value "${raw}"`);
  }
  const normalized = raw.includes(".")
    ? raw.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "")
    : raw;
  if (!normalized || normalized === "0") {
    throw new Error("Value must be greater than zero");
  }
  return normalized;
};

const decimalToFraction = (value: string): { numerator: bigint; denominator: bigint } => {
  const normalized = normalizePositiveDecimal(value);
  const [intPartRaw, fracPartRaw = ""] = normalized.split(".");
  const intPart = intPartRaw || "0";
  const denominator = 10n ** BigInt(fracPartRaw.length);
  const numerator = BigInt(`${intPart}${fracPartRaw}` || "0");
  return {
    numerator,
    denominator,
  };
};

const ratioToDecimalString = (
  numerator: bigint,
  numeratorDecimals: number,
  denominator: bigint,
  denominatorDecimals: number,
  scale = 12,
): string => {
  if (numerator <= 0n || denominator <= 0n) {
    throw new Error("Cannot derive a price from zero amounts");
  }

  const scaledNumerator = numerator * 10n ** BigInt(scale + denominatorDecimals);
  const scaledDenominator = denominator * 10n ** BigInt(numeratorDecimals);
  const quotient = scaledNumerator / scaledDenominator;
  const digits = quotient.toString().padStart(scale + 1, "0");
  const intPart = digits.slice(0, -scale) || "0";
  const fracPart = digits.slice(-scale).replace(/0+$/, "");
  return fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
};

const applyPercentDelta = (
  basisPrice: string,
  percent: number,
  direction: z.infer<typeof triggerDirectionSchema>,
): string => {
  if (!Number.isFinite(percent) || percent <= 0) {
    throw new Error("Percent delta must be greater than zero");
  }

  const basisFraction = decimalToFraction(basisPrice);
  const percentFraction = decimalToFraction(normalizePositiveDecimal(percent));
  const multiplierDenominator = 100n * percentFraction.denominator;
  const multiplierNumerator =
    direction.endsWith("Above")
      ? 100n * percentFraction.denominator + percentFraction.numerator
      : 100n * percentFraction.denominator - percentFraction.numerator;
  if (multiplierNumerator <= 0n) {
    throw new Error("Percent delta drives the derived trigger price to zero or below");
  }

  const numerator = basisFraction.numerator * multiplierNumerator;
  const denominator = basisFraction.denominator * multiplierDenominator;

  return ratioToDecimalString(numerator, 0, denominator, 0, 12);
};

const decimalToRawAmount = (
  uiAmount: string,
  decimals: number,
): bigint => {
  const normalized = normalizePositiveDecimal(uiAmount);
  const [intPartRaw, fracPartRaw = ""] = normalized.split(".");
  if (fracPartRaw.length > decimals) {
    throw new Error(`Price precision exceeds token decimals (${decimals})`);
  }
  const paddedFrac = fracPartRaw.padEnd(decimals, "0").slice(0, decimals);
  const digits = `${intPartRaw || "0"}${paddedFrac}`.replace(/^0+(?=\d)/, "") || "0";
  return BigInt(digits);
};

const divRound = (numerator: bigint, denominator: bigint): bigint => {
  if (denominator === 0n) {
    throw new Error("Division by zero");
  }
  return (numerator + denominator / 2n) / denominator;
};

export const resolveTriggerAdapter = async (ctx: ActionContext): Promise<JupiterTriggerAdapter> => {
  const triggerContext = ctx as TriggerContext;
  const existingAdapter = triggerContext.jupiterTrigger;
  if (existingAdapter) {
    return existingAdapter;
  }

  const resolvedAdapter = await createJupiterTriggerAdapterFromConfig();
  if (resolvedAdapter) {
    triggerContext.jupiterTrigger = resolvedAdapter;
    return resolvedAdapter;
  }

  const adapter = triggerContext.jupiterTrigger;
  if (!adapter) {
    throw new Error(
      "Missing Jupiter Trigger adapter. Configure integrations/jupiter/api-key in the active instance vault. Trigger orders share the same Jupiter API key as Ultra.",
    );
  }
  return adapter;
};

export const signTriggerTransactionIfNeeded = async (
  ctx: ActionContext,
  input: { signedTransaction?: string; transaction?: string },
): Promise<string> => {
  return await signOrderTransactionIfNeeded(ctx, input);
};

export const resolveWalletAddressFromInput = async (input: {
  wallet?: unknown;
  walletGroup?: string;
  walletName?: string;
  user?: string;
}): Promise<string | null> => {
  if (typeof input.user === "string" && input.user.trim().length > 0) {
    return input.user.trim();
  }

  const entry = await findManagedWalletEntryBySelection({
    wallet: input.wallet as never,
    walletGroup: input.walletGroup,
    walletName: input.walletName,
  });
  return entry?.address ?? null;
};

const getStateStore = (ctx: ActionContext): StateStore | null => {
  const store = (ctx as TriggerContext).stateStore;
  return store ?? null;
};

const readTelemetryCandidate = (receipt: ActionResult): ReceiptSwapCandidate | null => {
  if (!receipt.ok || !isRecord(receipt.data)) {
    return null;
  }

  const telemetry = isRecord(receipt.data.telemetry) ? receipt.data.telemetry : null;
  if (!telemetry) {
    return null;
  }

  const walletAddress = typeof telemetry.walletAddress === "string" ? telemetry.walletAddress : "";
  const inputMint = typeof telemetry.inputMint === "string" ? telemetry.inputMint : "";
  const outputMint = typeof telemetry.outputMint === "string" ? telemetry.outputMint : "";
  const inputAmount = typeof telemetry.quoteInAmount === "string" ? telemetry.quoteInAmount : "";
  const outputAmount =
    typeof telemetry.outAmount === "string" && telemetry.outAmount.length > 0
      ? telemetry.outAmount
      : typeof telemetry.quoteOutAmount === "string"
        ? telemetry.quoteOutAmount
        : "";

  if (!walletAddress || !inputMint || !outputMint || !inputAmount || !outputAmount) {
    return null;
  }

  const inputDecimals = inputMint === SOL_MINT ? 9 : undefined;
  const outputDecimals = outputMint === SOL_MINT ? 9 : undefined;

  return {
    walletAddress,
    inputMint,
    outputMint,
    inputRawAmount: BigInt(inputAmount),
    inputDecimals: inputDecimals ?? 0,
    outputRawAmount: BigInt(outputAmount),
    outputDecimals: outputDecimals ?? 0,
  };
};

const fillMissingDecimals = async (
  ctx: ActionContext,
  candidate: ReceiptSwapCandidate,
): Promise<ReceiptSwapCandidate> => {
  const tokenAccounts = (ctx as { tokenAccounts?: { getDecimals: (mint: string) => Promise<number> } }).tokenAccounts;
  if (!tokenAccounts) {
    throw new Error("Missing token account adapter in action context (ctx.tokenAccounts)");
  }

  const inputDecimals = candidate.inputDecimals || (candidate.inputMint === SOL_MINT ? 9 : await tokenAccounts.getDecimals(candidate.inputMint));
  const outputDecimals = candidate.outputDecimals || (candidate.outputMint === SOL_MINT ? 9 : await tokenAccounts.getDecimals(candidate.outputMint));
  return {
    ...candidate,
    inputDecimals,
    outputDecimals,
  };
};

const buildReceiptDerivedPrice = async (params: {
  ctx: ActionContext;
  walletAddress: string;
  currentInputMint: string;
  currentOutputMint: string;
  direction: z.infer<typeof triggerDirectionSchema>;
}): Promise<string | null> => {
  const store = getStateStore(params.ctx);
  if (!store) {
    return null;
  }

  const receipts = store.getRecentReceipts(MAX_RECEIPT_SCAN);
  for (const receipt of receipts) {
    const baseCandidate = readTelemetryCandidate(receipt);
    if (!baseCandidate || baseCandidate.walletAddress !== params.walletAddress) {
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const candidate = await fillMissingDecimals(params.ctx, baseCandidate);
    const isSellDirection = params.direction.startsWith("sell");
    const matches =
      isSellDirection
        ? candidate.inputMint === params.currentOutputMint && candidate.outputMint === params.currentInputMint
        : candidate.inputMint === params.currentInputMint && candidate.outputMint === params.currentOutputMint;
    if (!matches) {
      continue;
    }

    return isSellDirection
      ? ratioToDecimalString(
          candidate.inputRawAmount,
          candidate.inputDecimals,
          candidate.outputRawAmount,
          candidate.outputDecimals,
        )
      : ratioToDecimalString(
          candidate.outputRawAmount,
          candidate.outputDecimals,
          candidate.inputRawAmount,
          candidate.inputDecimals,
        );
  }

  return null;
};

const collectHeliusSwapSide = (
  tokenEntries: HeliusSwapEvent["tokenInputs"] | HeliusSwapEvent["tokenOutputs"] | undefined,
  nativeEntry: HeliusSwapEvent["nativeInput"] | HeliusSwapEvent["nativeOutput"] | undefined,
  targetMint: string,
): HeliusSwapSide | null => {
  let totalRaw = 0n;
  let decimals: number | null = null;

  if (targetMint === SOL_MINT && nativeEntry?.amount) {
    totalRaw += BigInt(nativeEntry.amount);
    decimals = 9;
  }

  for (const entry of tokenEntries ?? []) {
    if (entry?.mint !== targetMint) {
      continue;
    }
    const rawAmount = entry.rawTokenAmount?.tokenAmount;
    const entryDecimals = entry.rawTokenAmount?.decimals;
    if (typeof rawAmount !== "string" || typeof entryDecimals !== "number") {
      continue;
    }
    totalRaw += BigInt(rawAmount);
    decimals = entryDecimals;
  }

  if (totalRaw <= 0n || decimals == null) {
    return null;
  }

  return {
    mint: targetMint,
    rawAmount: totalRaw,
    decimals,
  };
};

const fetchRecentHeliusSwaps = async (walletAddress: string): Promise<HeliusEnhancedTransaction[]> => {
  const { apiKey } = await resolveHeliusRpcConfig();
  if (!apiKey) {
    return [];
  }

  const helius = createHelius({ apiKey });
  const transactions = await helius.enhanced.getTransactionsByAddress({
    address: walletAddress,
    limit: MAX_HELIUS_HISTORY,
    sortOrder: "desc",
    type: "SWAP",
  });

  return Array.isArray(transactions) ? (transactions as HeliusEnhancedTransaction[]) : [];
};

const buildHeliusDerivedPrice = async (params: {
  walletAddress: string;
  currentInputMint: string;
  currentOutputMint: string;
  direction: z.infer<typeof triggerDirectionSchema>;
}): Promise<string | null> => {
  try {
    const transactions = await fetchRecentHeliusSwaps(params.walletAddress);
    const isSellDirection = params.direction.startsWith("sell");

    for (const transaction of transactions) {
      const swap = transaction.events?.swap;
      if (!swap) {
        continue;
      }

      if (isSellDirection) {
        const spentOutput = collectHeliusSwapSide(swap.tokenInputs, swap.nativeInput, params.currentOutputMint);
        const acquiredInput = collectHeliusSwapSide(swap.tokenOutputs, swap.nativeOutput, params.currentInputMint);
        if (!spentOutput || !acquiredInput) {
          continue;
        }

        return ratioToDecimalString(
          spentOutput.rawAmount,
          spentOutput.decimals,
          acquiredInput.rawAmount,
          acquiredInput.decimals,
        );
      }

      const spentInput = collectHeliusSwapSide(swap.tokenInputs, swap.nativeInput, params.currentInputMint);
      const acquiredOutput = collectHeliusSwapSide(swap.tokenOutputs, swap.nativeOutput, params.currentOutputMint);
      if (!spentInput || !acquiredOutput) {
        continue;
      }

      return ratioToDecimalString(
        acquiredOutput.rawAmount,
        acquiredOutput.decimals,
        spentInput.rawAmount,
        spentInput.decimals,
      );
    }
  } catch {
    return null;
  }

  return null;
};

export const resolveDerivedTriggerPrice = async (params: {
  ctx: ActionContext;
  walletAddress: string;
  inputMint: string;
  outputMint: string;
  direction: z.infer<typeof triggerDirectionSchema>;
  trigger: z.infer<typeof triggerSpecSchema>;
  buyPrice?: string | number;
  buyPriceSource?: z.infer<typeof triggerBasisSourceSchema>;
}): Promise<TriggerDerivedPriceResolution> => {
  if (params.trigger.kind === "exactPrice") {
    return {
      triggerPrice: normalizePositiveDecimal(params.trigger.price),
      triggerMode: "exactPrice",
    };
  }

  if (params.buyPriceSource === "explicit" && params.buyPrice === undefined) {
    throw new Error("buyPriceSource=explicit requires buyPrice");
  }

  const explicitBuyPrice =
    params.buyPrice !== undefined ? normalizePositiveDecimal(params.buyPrice) : undefined;
  const receiptBuyPrice =
    explicitBuyPrice
    ?? await buildReceiptDerivedPrice({
      ctx: params.ctx,
      walletAddress: params.walletAddress,
      currentInputMint: params.inputMint,
      currentOutputMint: params.outputMint,
      direction: params.direction,
    });
  const derivedBuyPrice =
    receiptBuyPrice
    ?? await buildHeliusDerivedPrice({
      walletAddress: params.walletAddress,
      currentInputMint: params.inputMint,
      currentOutputMint: params.outputMint,
      direction: params.direction,
    });

  if (!derivedBuyPrice) {
    throw new Error(
      `Unable to resolve buy price for ${params.inputMint}/${params.outputMint}. Pass buyPrice explicitly.`,
    );
  }

  return {
    triggerPrice: applyPercentDelta(derivedBuyPrice, params.trigger.percent, params.direction),
    buyPrice: derivedBuyPrice,
    triggerMode: "percentFromBuyPrice",
  };
};

export const buildMakingAndTakingAmounts = async (params: {
  ctx: ActionContext;
  inputCoin: string;
  outputCoin: string;
  amount: string | number;
  amountUnit?: "ui" | "native" | "percent";
  coinAliases?: Record<string, string>;
  walletAddress: string;
  triggerPrice: string;
}): Promise<{
  inputMint: string;
  outputMint: string;
  makingAmount: string;
  takingAmount: string;
}> => {
  const inputMint = normalizeCoinToMint(params.inputCoin, params.coinAliases);
  const outputMint = normalizeCoinToMint(params.outputCoin, params.coinAliases);
  const makingAmount = await resolveRawAmount(
    params.ctx,
    inputMint,
    params.walletAddress,
    params.amount,
    params.amountUnit,
  );

  const tokenAccounts = (params.ctx as { tokenAccounts?: { getDecimals: (mint: string) => Promise<number> } }).tokenAccounts;
  if (!tokenAccounts) {
    throw new Error("Missing token account adapter in action context (ctx.tokenAccounts)");
  }

  const inputDecimals = inputMint === SOL_MINT ? 9 : await tokenAccounts.getDecimals(inputMint);
  const outputDecimals = outputMint === SOL_MINT ? 9 : await tokenAccounts.getDecimals(outputMint);
  const priceRaw = decimalToRawAmount(params.triggerPrice, 12);
  const numerator = makingAmount * priceRaw * 10n ** BigInt(outputDecimals);
  const denominator = 10n ** BigInt(12 + inputDecimals);
  const takingAmount = divRound(numerator, denominator);
  if (takingAmount <= 0n) {
    throw new Error("Derived takingAmount is zero; increase amount or trigger price");
  }

  return {
    inputMint,
    outputMint,
    makingAmount: makingAmount.toString(10),
    takingAmount: takingAmount.toString(10),
  };
};

export const resolveMakerAddress = (ctx: ActionContext, input?: { maker?: string }): string => {
  const maker = input?.maker?.trim() || getTakerFromContext(ctx);
  if (!maker) {
    throw new Error("Missing maker wallet address");
  }
  return maker;
};

export {
  createActionFailure,
  createActionSuccess,
};
