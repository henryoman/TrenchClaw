import type { GuiSolPriceResponse } from "@trenchclaw/types";
import { getDexscreenerTokenPairsByChain, type DexscreenerPairInfo } from "../../solana/actions/data-fetch/api/dexscreener";

const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const SOL_PRICE_REFRESH_COOLDOWN_MS = 3_000;
const STABLE_QUOTE_SYMBOLS = new Set(["USD", "USDC", "USDT"]);
const EMPTY_SOL_PRICE_RESPONSE: GuiSolPriceResponse = {
  priceUsd: null,
  updatedAt: null,
};

let lastKnownSolPrice: GuiSolPriceResponse = EMPTY_SOL_PRICE_RESPONSE;
let lastExternalFetchStartedAt = 0;
let inFlightSolPriceRefresh: Promise<GuiSolPriceResponse> | null = null;

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getStableQuoteScore = (pair: DexscreenerPairInfo): number => {
  const quoteSymbol = pair.quoteToken?.symbol?.trim().toUpperCase();
  return quoteSymbol && STABLE_QUOTE_SYMBOLS.has(quoteSymbol) ? 1 : 0;
};

const getLiquidityUsd = (pair: DexscreenerPairInfo): number => toFiniteNumber(pair.liquidity?.usd) ?? 0;

const pickBestSolPricePair = (pairs: DexscreenerPairInfo[]): DexscreenerPairInfo | null => {
  let bestPair: DexscreenerPairInfo | null = null;
  let bestStableQuoteScore = -1;
  let bestLiquidityUsd = -1;

  for (const pair of pairs) {
    const priceUsd = toFiniteNumber(pair.priceUsd);
    if (priceUsd === null) {
      continue;
    }

    const stableQuoteScore = getStableQuoteScore(pair);
    const liquidityUsd = getLiquidityUsd(pair);
    if (
      stableQuoteScore > bestStableQuoteScore
      || (stableQuoteScore === bestStableQuoteScore && liquidityUsd > bestLiquidityUsd)
    ) {
      bestPair = pair;
      bestStableQuoteScore = stableQuoteScore;
      bestLiquidityUsd = liquidityUsd;
    }
  }

  return bestPair;
};

const refreshSolPrice = async (): Promise<GuiSolPriceResponse> => {
  const pairs = await getDexscreenerTokenPairsByChain({
    tokenAddress: WRAPPED_SOL_MINT,
  });
  const bestPair = pickBestSolPricePair(pairs);
  const priceUsd = toFiniteNumber(bestPair?.priceUsd);

  if (priceUsd === null) {
    throw new Error("SOL price unavailable");
  }

  const response: GuiSolPriceResponse = {
    priceUsd,
    updatedAt: Date.now(),
  };
  lastKnownSolPrice = response;
  return response;
};

export const getSolPrice = async (): Promise<GuiSolPriceResponse> => {
  const now = Date.now();

  if (inFlightSolPriceRefresh) {
    return inFlightSolPriceRefresh;
  }

  if (lastExternalFetchStartedAt > 0 && now - lastExternalFetchStartedAt < SOL_PRICE_REFRESH_COOLDOWN_MS) {
    return lastKnownSolPrice;
  }

  lastExternalFetchStartedAt = now;
  inFlightSolPriceRefresh = refreshSolPrice()
    .catch(() => lastKnownSolPrice)
    .finally(() => {
      inFlightSolPriceRefresh = null;
    });

  return inFlightSolPriceRefresh;
};

export const resetSolPriceCacheForTests = (): void => {
  lastKnownSolPrice = EMPTY_SOL_PRICE_RESPONSE;
  lastExternalFetchStartedAt = 0;
  inFlightSolPriceRefresh = null;
};
