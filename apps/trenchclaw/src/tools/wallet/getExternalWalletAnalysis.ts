import type { RuntimeApiSolPriceResponse } from "@trenchclaw/types";
import { z } from "zod";

import type { Action } from "../../ai/contracts/types/action";
import type { ActionContext } from "../../ai/contracts/types/context";
import { resolveHeliusRpcConfig } from "../../solana/lib/rpc/helius";
import { base58AddressSchema } from "../../solana/lib/wallet/walletTypes";
import { getSolPrice } from "../market/solPrice";
import {
  getSwapHistory,
  type SwapHistoryInput,
  type SwapHistoryOutput,
} from "../trading/swapHistory";
import {
  loadDirectWalletContents,
  type DirectWalletContentsOutput,
  type ManagedWalletContentsDataSource,
  type ManagedWalletContentsWalletError,
  type ManagedWalletTokenBalance,
  type WalletContentWarning,
} from "./getManagedWalletContents";

const DEFAULT_RECENT_TRADE_LIMIT = 10;
const MAX_RECENT_TRADE_LIMIT = 20;
const DEFAULT_TOP_HOLDINGS_LIMIT = 10;
const MAX_TOP_HOLDINGS_LIMIT = 20;

const getExternalWalletAnalysisInputSchema = z.object({
  walletAddress: base58AddressSchema,
  tradeLimit: z.number().int().positive().max(MAX_RECENT_TRADE_LIMIT).default(DEFAULT_RECENT_TRADE_LIMIT),
  includeZeroBalances: z.boolean().default(false),
  topHoldingsLimit: z.number().int().positive().max(MAX_TOP_HOLDINGS_LIMIT).default(DEFAULT_TOP_HOLDINGS_LIMIT),
});
const getExternalWalletHoldingsInputSchema = z.object({
  walletAddress: base58AddressSchema,
  includeZeroBalances: z.boolean().default(false),
  topHoldingsLimit: z.number().int().positive().max(MAX_TOP_HOLDINGS_LIMIT).default(DEFAULT_TOP_HOLDINGS_LIMIT),
});

type GetExternalWalletAnalysisInput = z.output<typeof getExternalWalletAnalysisInputSchema>;
type GetExternalWalletHoldingsInput = z.output<typeof getExternalWalletHoldingsInputSchema>;

interface ExternalWalletAnalysisWarning extends WalletContentWarning {}

interface ExternalWalletTradeReadError {
  code: string;
  message: string;
  retryable: boolean;
}

interface ExternalWalletHoldingSummary {
  mintAddress: string;
  tokenProgram: ManagedWalletTokenBalance["tokenProgram"];
  symbol: string | null;
  name: string | null;
  balanceRaw: string;
  balanceUiString: string;
  decimals: number;
  priceUsd: number | null;
  valueUsd: number | null;
  shareOfKnownTokenValuePercent: number | null;
}

interface ExternalWalletRecentTradesSummary {
  limit: number;
  returned: number;
  structuredSwapCount: number;
  sources: SwapHistoryOutput["sources"];
  mostRecentTradeAtUnixSecondsUtc: number | null;
  mostRecentTradeAtUtcIso: string | null;
  swaps: SwapHistoryOutput["swaps"];
}

export interface ExternalWalletAnalysisOutput {
  analysisScope: "wallet-holdings-plus-recent-swaps";
  walletAddress: string;
  snapshotAt: number;
  includeZeroBalances: boolean;
  dataSource: ManagedWalletContentsDataSource;
  partial: boolean;
  warnings: ExternalWalletAnalysisWarning[];
  liveSolPrice: RuntimeApiSolPriceResponse & {
    source: "shared-backend-cache";
  };
  summary: {
    totalKnownValueUsd: number | null;
    recentTradeCount: number;
    structuredRecentTradeCount: number;
    mostRecentTradeAtUtcIso: string | null;
  };
  holdings: {
    nativeSol: {
      balanceLamports: string;
      balanceSol: number;
      valueUsd: number | null;
    };
    tokenCount: number;
    tokenBalances: ManagedWalletTokenBalance[];
    assetCount: number;
    collectibleCount: number;
    compressedCollectibleCount: number;
    pricedTokenCount: number;
    unpricedTokenCount: number;
    pricedTokenTotalUsd: number | null;
    totalKnownValueUsd: number | null;
    topHoldings: ExternalWalletHoldingSummary[];
  };
  recentTrades: ExternalWalletRecentTradesSummary | null;
  recentTradesError: ExternalWalletTradeReadError | null;
  walletErrors: ManagedWalletContentsWalletError[];
}

export interface ExternalWalletHoldingsOutput {
  analysisScope: "current-wallet-holdings";
  walletAddress: string;
  snapshotAt: number;
  includeZeroBalances: boolean;
  dataSource: ManagedWalletContentsDataSource;
  partial: boolean;
  warnings: ExternalWalletAnalysisWarning[];
  liveSolPrice: RuntimeApiSolPriceResponse & {
    source: "shared-backend-cache";
  };
  summary: {
    totalKnownValueUsd: number | null;
    tokenCount: number;
    pricedTokenCount: number;
    unpricedTokenCount: number;
  };
  holdings: ExternalWalletAnalysisOutput["holdings"];
  walletErrors: ManagedWalletContentsWalletError[];
}

interface GetExternalWalletAnalysisDeps {
  loadWalletContents?: (input: {
    walletAddress: string;
    rpcUrl?: string;
    includeZeroBalances: boolean;
    lane?: "inline" | "background";
    useHeliusDas: boolean;
  }) => Promise<DirectWalletContentsOutput>;
  loadSwapHistory?: (input: SwapHistoryInput) => Promise<SwapHistoryOutput>;
  loadSolPrice?: () => Promise<RuntimeApiSolPriceResponse>;
  resolvePreferredRpc?: (ctx: ActionContext) => Promise<{
    rpcUrl?: string;
    useHeliusDas: boolean;
  }>;
}

const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const sumKnownNumbers = (left: number | null | undefined, right: number | null | undefined): number | null => {
  if (typeof left === "number" && Number.isFinite(left) && typeof right === "number" && Number.isFinite(right)) {
    return left + right;
  }
  if (typeof left === "number" && Number.isFinite(left)) {
    return left;
  }
  if (typeof right === "number" && Number.isFinite(right)) {
    return right;
  }
  return null;
};

const isRetryableWalletAnalysisError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b/u.test(message)
    || /\b503\b/u.test(message)
    || /\b504\b/u.test(message)
    || /rate limit/iu.test(message)
    || /too many requests/iu.test(message)
    || /temporarily unavailable/iu.test(message)
    || /timed out/iu.test(message)
    || /\btimeout\b/iu.test(message)
    || /\babort(?:ed)?\b/iu.test(message)
    || /overload(?:ed)?/iu.test(message)
    || /please try again/iu.test(message);
};

const compareTokenBalancesByValue = (left: ManagedWalletTokenBalance, right: ManagedWalletTokenBalance): number => {
  const leftValue = toFiniteNumberOrNull(left.valueUsd);
  const rightValue = toFiniteNumberOrNull(right.valueUsd);

  if (leftValue !== null || rightValue !== null) {
    if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
      return rightValue - leftValue;
    }
    if (rightValue !== null) {
      return 1;
    }
    if (leftValue !== null) {
      return -1;
    }
  }

  if (left.balance !== right.balance) {
    return right.balance - left.balance;
  }
  return left.mintAddress.localeCompare(right.mintAddress);
};

const toTopHoldingSummary = (
  tokenBalance: ManagedWalletTokenBalance,
  pricedTokenTotalUsd: number | null,
): ExternalWalletHoldingSummary => {
  const valueUsd = toFiniteNumberOrNull(tokenBalance.valueUsd);
  return {
    mintAddress: tokenBalance.mintAddress,
    tokenProgram: tokenBalance.tokenProgram,
    symbol: tokenBalance.symbol ?? null,
    name: tokenBalance.name ?? null,
    balanceRaw: tokenBalance.balanceRaw,
    balanceUiString: tokenBalance.balanceUiString,
    decimals: tokenBalance.decimals,
    priceUsd: toFiniteNumberOrNull(tokenBalance.priceUsd),
    valueUsd,
    shareOfKnownTokenValuePercent:
      valueUsd !== null
      && pricedTokenTotalUsd !== null
      && pricedTokenTotalUsd > 0
        ? (valueUsd / pricedTokenTotalUsd) * 100
        : null,
  };
};

const summarizeRecentTrades = (swapHistory: SwapHistoryOutput): ExternalWalletRecentTradesSummary => ({
  limit: swapHistory.limit,
  returned: swapHistory.returned,
  structuredSwapCount: swapHistory.structuredSwapCount,
  sources: swapHistory.sources,
  mostRecentTradeAtUnixSecondsUtc: swapHistory.swaps[0]?.timestampUnixSecondsUtc ?? null,
  mostRecentTradeAtUtcIso: swapHistory.swaps[0]?.timestampUtcIso ?? null,
  swaps: swapHistory.swaps,
});

const defaultResolvePreferredRpc = async (ctx: ActionContext): Promise<{
  rpcUrl?: string;
  useHeliusDas: boolean;
}> => {
  const heliusConfig = await resolveHeliusRpcConfig({
    rpcUrl: ctx.rpcUrl,
  });
  return {
    rpcUrl: heliusConfig.rpcUrl ?? ctx.rpcUrl,
    useHeliusDas: Boolean(heliusConfig.rpcUrl),
  };
};

const defaultLoadWalletContents = async (input: {
  walletAddress: string;
  rpcUrl?: string;
  includeZeroBalances: boolean;
  lane?: "inline" | "background";
  useHeliusDas: boolean;
}): Promise<DirectWalletContentsOutput> =>
  await loadDirectWalletContents({
    address: input.walletAddress,
    rpcUrl: input.rpcUrl,
    includeZeroBalances: input.includeZeroBalances,
    lane: input.lane,
    useBatchRequests: true,
    useHeliusDas: input.useHeliusDas,
  });

export const createGetExternalWalletAnalysisAction = (
  deps: GetExternalWalletAnalysisDeps = {},
): Action<GetExternalWalletAnalysisInput, ExternalWalletAnalysisOutput> => {
  const loadWalletContents = deps.loadWalletContents ?? defaultLoadWalletContents;
  const loadSwapHistory = deps.loadSwapHistory ?? getSwapHistory;
  const loadSolPrice = deps.loadSolPrice ?? getSolPrice;
  const resolvePreferredRpc = deps.resolvePreferredRpc ?? defaultResolvePreferredRpc;

  return {
    name: "getExternalWalletAnalysis",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: getExternalWalletAnalysisInputSchema,
    async execute(ctx, rawInput) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();

      try {
        const input = getExternalWalletAnalysisInputSchema.parse(rawInput);
        const rpc = await resolvePreferredRpc(ctx);
        const lane = ctx.jobMeta ? "background" : "inline";

        const [walletContentsResult, swapHistoryResult, solPriceResult] = await Promise.allSettled([
          loadWalletContents({
            walletAddress: input.walletAddress,
            rpcUrl: rpc.rpcUrl,
            includeZeroBalances: input.includeZeroBalances,
            lane,
            useHeliusDas: rpc.useHeliusDas,
          }),
          loadSwapHistory({
            walletAddress: input.walletAddress,
            limit: input.tradeLimit,
          }),
          loadSolPrice(),
        ]);

        if (walletContentsResult.status === "rejected") {
          throw walletContentsResult.reason;
        }

        const walletContents = walletContentsResult.value;
        const warnings: ExternalWalletAnalysisWarning[] = [...walletContents.warnings];
        let partial = walletContents.partial;

        let recentTrades: ExternalWalletRecentTradesSummary | null = null;
        let recentTradesError: ExternalWalletTradeReadError | null = null;
        if (swapHistoryResult.status === "fulfilled") {
          recentTrades = summarizeRecentTrades(swapHistoryResult.value);
        } else {
          partial = true;
          recentTradesError = {
            code: isRetryableWalletAnalysisError(swapHistoryResult.reason)
              ? "RECENT_TRADES_RATE_LIMITED"
              : "RECENT_TRADES_UNAVAILABLE",
            message: swapHistoryResult.reason instanceof Error
              ? swapHistoryResult.reason.message
              : String(swapHistoryResult.reason),
            retryable: isRetryableWalletAnalysisError(swapHistoryResult.reason),
          };
          warnings.push({
            code: recentTradesError.code,
            message: `Recent trade analysis was unavailable: ${recentTradesError.message}`,
          });
        }

        const liveSolPrice =
          solPriceResult.status === "fulfilled"
            ? solPriceResult.value
            : {
                priceUsd: null,
                updatedAt: null,
              };
        if (solPriceResult.status === "rejected") {
          partial = true;
          warnings.push({
            code: "SOL_PRICE_UNAVAILABLE",
            message: "Live SOL/USD valuation was unavailable, so SOL value fields may be null.",
          });
        }

        const solValueUsd =
          typeof liveSolPrice.priceUsd === "number" && Number.isFinite(liveSolPrice.priceUsd)
            ? walletContents.balanceSol * liveSolPrice.priceUsd
            : null;
        const pricedTokenCount = walletContents.tokenBalances.filter((tokenBalance) =>
          toFiniteNumberOrNull(tokenBalance.valueUsd) !== null).length;
        const unpricedTokenCount = walletContents.tokenCount - pricedTokenCount;
        const totalKnownValueUsd = sumKnownNumbers(solValueUsd, walletContents.pricedTokenTotalUsd);
        const topHoldings = walletContents.tokenBalances
          .toSorted(compareTokenBalancesByValue)
          .slice(0, input.topHoldingsLimit)
          .map((tokenBalance) => toTopHoldingSummary(tokenBalance, walletContents.pricedTokenTotalUsd));

        return {
          ok: true,
          retryable: false,
          data: {
            analysisScope: "wallet-holdings-plus-recent-swaps",
            walletAddress: input.walletAddress,
            snapshotAt: Date.now(),
            includeZeroBalances: input.includeZeroBalances,
            dataSource: walletContents.dataSource,
            partial,
            warnings,
            liveSolPrice: {
              ...liveSolPrice,
              source: "shared-backend-cache",
            },
            summary: {
              totalKnownValueUsd,
              recentTradeCount: recentTrades?.returned ?? 0,
              structuredRecentTradeCount: recentTrades?.structuredSwapCount ?? 0,
              mostRecentTradeAtUtcIso: recentTrades?.mostRecentTradeAtUtcIso ?? null,
            },
            holdings: {
              nativeSol: {
                balanceLamports: walletContents.balanceLamports,
                balanceSol: walletContents.balanceSol,
                valueUsd: solValueUsd,
              },
              tokenCount: walletContents.tokenCount,
              tokenBalances: walletContents.tokenBalances,
              assetCount: walletContents.assetCount,
              collectibleCount: walletContents.collectibleCount,
              compressedCollectibleCount: walletContents.compressedCollectibleCount,
              pricedTokenCount,
              unpricedTokenCount,
              pricedTokenTotalUsd: walletContents.pricedTokenTotalUsd,
              totalKnownValueUsd,
              topHoldings,
            },
            recentTrades,
            recentTradesError,
            walletErrors: walletContents.walletErrors,
          },
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      } catch (error) {
        return {
          ok: false,
          retryable: isRetryableWalletAnalysisError(error),
          error: error instanceof Error ? error.message : String(error),
          code: isRetryableWalletAnalysisError(error)
            ? "GET_EXTERNAL_WALLET_ANALYSIS_RATE_LIMITED"
            : "GET_EXTERNAL_WALLET_ANALYSIS_FAILED",
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }
    },
  };
};

export const getExternalWalletAnalysisAction = createGetExternalWalletAnalysisAction();

export const createGetExternalWalletHoldingsAction = (
  deps: GetExternalWalletAnalysisDeps = {},
): Action<GetExternalWalletHoldingsInput, ExternalWalletHoldingsOutput> => {
  const analysisAction = createGetExternalWalletAnalysisAction({
    ...deps,
    loadSwapHistory: async ({ walletAddress }) => ({
      walletAddress,
      limit: 1,
      backendTimezone: "UTC",
      displayTimezone: "America/Los_Angeles",
      returned: 0,
      sources: [],
      structuredSwapCount: 0,
      swaps: [],
    }),
  });

  return {
    name: "getExternalWalletHoldings",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: getExternalWalletHoldingsInputSchema,
    async execute(ctx, rawInput) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();

      try {
        const input = getExternalWalletHoldingsInputSchema.parse(rawInput);
        const result = await analysisAction.execute(ctx, {
          walletAddress: input.walletAddress,
          includeZeroBalances: input.includeZeroBalances,
          topHoldingsLimit: input.topHoldingsLimit,
          tradeLimit: 1,
        });

        if (!result.ok) {
          return {
            ok: false,
            retryable: result.retryable,
            error: result.error,
            code:
              result.code === "GET_EXTERNAL_WALLET_ANALYSIS_RATE_LIMITED"
                ? "GET_EXTERNAL_WALLET_HOLDINGS_RATE_LIMITED"
                : "GET_EXTERNAL_WALLET_HOLDINGS_FAILED",
            durationMs: Date.now() - startedAt,
            timestamp: Date.now(),
            idempotencyKey,
          };
        }

        const analysis = result.data as ExternalWalletAnalysisOutput;
        return {
          ok: true,
          retryable: false,
          data: {
            analysisScope: "current-wallet-holdings",
            walletAddress: analysis.walletAddress,
            snapshotAt: analysis.snapshotAt,
            includeZeroBalances: analysis.includeZeroBalances,
            dataSource: analysis.dataSource,
            partial: analysis.partial,
            warnings: analysis.warnings,
            liveSolPrice: analysis.liveSolPrice,
            summary: {
              totalKnownValueUsd: analysis.holdings.totalKnownValueUsd,
              tokenCount: analysis.holdings.tokenCount,
              pricedTokenCount: analysis.holdings.pricedTokenCount,
              unpricedTokenCount: analysis.holdings.unpricedTokenCount,
            },
            holdings: analysis.holdings,
            walletErrors: analysis.walletErrors,
          },
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      } catch (error) {
        return {
          ok: false,
          retryable: isRetryableWalletAnalysisError(error),
          error: error instanceof Error ? error.message : String(error),
          code: isRetryableWalletAnalysisError(error)
            ? "GET_EXTERNAL_WALLET_HOLDINGS_RATE_LIMITED"
            : "GET_EXTERNAL_WALLET_HOLDINGS_FAILED",
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }
    },
  };
};

export const getExternalWalletHoldingsAction = createGetExternalWalletHoldingsAction();
