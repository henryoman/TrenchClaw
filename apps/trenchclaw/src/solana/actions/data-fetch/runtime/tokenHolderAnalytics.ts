import { address } from "@solana/kit";
import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import { getDexscreenerTokensByChain, getDexscreenerTopTokenBoosts, type DexscreenerPairInfo, type DexscreenerTokenBoost } from "../api/dexscreener";
import { getMultipleAccounts } from "../rpc/getMultipleAccounts";
import { createRateLimitedSolanaRpc } from "../../../lib/rpc/client";
import { resolveRequiredRpcUrl } from "../../../lib/rpc/urls";

const DEFAULT_WHALE_THRESHOLD_PERCENT = 1;
const DEFAULT_ANALYZED_TOKEN_LIMIT = 10;
const MAX_ANALYZED_TOKEN_LIMIT = 20;
const MAX_RETURNED_OWNERS = 10;
const SAFE_GET_MULTIPLE_ACCOUNTS_CHUNK_SIZE = 10;
const SHARE_SCALE = 1_000_000n;

const nonEmptyStringSchema = z.string().trim().min(1);

const tokenHolderDistributionInputSchema = z.object({
  mintAddress: nonEmptyStringSchema,
  whaleThresholdPercent: z.number().positive().max(100).optional(),
  topOwnersLimit: z.number().int().min(1).max(MAX_RETURNED_OWNERS).optional(),
});

const rankBoostedTokensByWhalesInputSchema = z.object({
  limit: z.number().int().min(1).max(MAX_ANALYZED_TOKEN_LIMIT).optional(),
  whaleThresholdPercent: z.number().positive().max(100).optional(),
  topOwnersLimit: z.number().int().min(1).max(MAX_RETURNED_OWNERS).optional(),
});

type TokenHolderDistributionInput = z.output<typeof tokenHolderDistributionInputSchema>;
type RankBoostedTokensByWhalesInput = z.output<typeof rankBoostedTokensByWhalesInputSchema>;

interface LargestTokenAccountEntry {
  address: string;
  amountRaw: bigint;
}

interface AggregatedOwnerEntry {
  ownerAddress: string;
  amountRaw: bigint;
  tokenAccounts: string[];
}

export interface TokenHolderOwnerSummary {
  ownerAddress: string;
  amountRaw: string;
  amountUiString: string;
  shareFraction: number;
  sharePercent: number;
  tokenAccountCount: number;
  tokenAccounts: string[];
}

export interface TokenHolderDistribution {
  mintAddress: string;
  decimals: number;
  totalSupplyRaw: string;
  totalSupplyUiString: string;
  analyzedLargestAccountCount: number;
  distinctOwnerCount: number;
  whaleThresholdPercent: number;
  whaleOwnerCount: number;
  whaleOwnerCountAtOnePercent: number;
  whaleOwnerCountAtFivePercent: number;
  top1OwnerShareFraction: number;
  top5OwnerShareFraction: number;
  top10OwnerShareFraction: number;
  topOwners: TokenHolderOwnerSummary[];
}

export interface RankedBoostedTokenWhaleEntry extends TokenHolderDistribution {
  tokenAddress: string;
  tokenName: string | null;
  tokenSymbol: string | null;
  boostAmount: number;
  boostTotalAmount: number;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
}

export interface RankedBoostedTokensByWhalesResult {
  whaleThresholdPercent: number;
  analyzedTokenCount: number;
  ranking: RankedBoostedTokenWhaleEntry[];
  winner: RankedBoostedTokenWhaleEntry | null;
}

interface GetTokenHolderDistributionDeps {
  loadHolderDistribution?: (input: {
    rpcUrl?: string;
    mintAddress: string;
    whaleThresholdPercent?: number;
    topOwnersLimit?: number;
  }) => Promise<TokenHolderDistribution>;
}

interface RankBoostedTokensByWhalesDeps extends GetTokenHolderDistributionDeps {
  loadTopTokenBoosts?: () => Promise<DexscreenerTokenBoost[]>;
  loadTokenPairs?: (input: { tokenAddresses: string[] }) => Promise<DexscreenerPairInfo[]>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isRetryableRpcError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b/u.test(message)
    || /\b403\b/u.test(message)
    || /rate limit/iu.test(message)
    || /too many requests/iu.test(message)
    || /\b503\b/u.test(message)
    || /\b504\b/u.test(message)
    || /temporarily unavailable/iu.test(message)
    || /timed out/iu.test(message)
    || /\btimeout\b/iu.test(message)
    || /\babort(?:ed)?\b/iu.test(message);
};

const normalizePositiveNumber = (value: number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;

const toFiniteNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim().length > 0 && Number.isFinite(Number(value))
      ? Number(value)
      : null;

const formatUiAmount = (amountRaw: bigint, decimals: number): string => {
  if (decimals <= 0) {
    return amountRaw.toString();
  }
  const divisor = 10n ** BigInt(decimals);
  const whole = amountRaw / divisor;
  const fraction = (amountRaw % divisor).toString().padStart(decimals, "0").replace(/0+$/u, "");
  return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
};

const toShareFraction = (amountRaw: bigint, totalSupplyRaw: bigint): number => {
  if (totalSupplyRaw <= 0n) {
    return 0;
  }
  const scaled = (amountRaw * SHARE_SCALE) / totalSupplyRaw;
  return Number(scaled) / Number(SHARE_SCALE);
};

const sumFractions = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0);

const parseLargestTokenAccounts = (value: unknown): LargestTokenAccountEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.address !== "string" || typeof entry.amount !== "string") {
      return [];
    }

    try {
      return [{
        address: entry.address,
        amountRaw: BigInt(entry.amount),
      }];
    } catch {
      return [];
    }
  });
};

const extractOwnerAddress = (account: unknown): string | null => {
  if (!isRecord(account) || !isRecord(account.data)) {
    return null;
  }
  const parsed = account.data.parsed;
  if (!isRecord(parsed) || !isRecord(parsed.info)) {
    return null;
  }
  return typeof parsed.info.owner === "string" && parsed.info.owner.trim().length > 0
    ? parsed.info.owner
    : null;
};

const aggregateOwners = (
  largestTokenAccounts: LargestTokenAccountEntry[],
  accountLookup: Map<string, unknown | null>,
): AggregatedOwnerEntry[] => {
  const ownerMap = new Map<string, AggregatedOwnerEntry>();

  for (const entry of largestTokenAccounts) {
    const ownerAddress = extractOwnerAddress(accountLookup.get(entry.address)) ?? entry.address;
    const existing = ownerMap.get(ownerAddress);
    if (existing) {
      existing.amountRaw += entry.amountRaw;
      existing.tokenAccounts.push(entry.address);
      continue;
    }
    ownerMap.set(ownerAddress, {
      ownerAddress,
      amountRaw: entry.amountRaw,
      tokenAccounts: [entry.address],
    });
  }

  return [...ownerMap.values()].sort((left, right) =>
    left.amountRaw > right.amountRaw ? -1 : left.amountRaw < right.amountRaw ? 1 : 0);
};

const pickBestPairForMint = (pairs: DexscreenerPairInfo[], mintAddress: string): DexscreenerPairInfo | null => {
  const relevantPairs = pairs.filter((pair) =>
    pair.baseToken?.address === mintAddress || pair.quoteToken?.address === mintAddress);

  if (relevantPairs.length === 0) {
    return null;
  }

  return relevantPairs
    .slice()
    .sort((left, right) => (right.liquidity?.usd ?? 0) - (left.liquidity?.usd ?? 0))[0] ?? null;
};

const readTokenMetadataFromPair = (pair: DexscreenerPairInfo | null, mintAddress: string): {
  tokenName: string | null;
  tokenSymbol: string | null;
} => {
  if (!pair) {
    return { tokenName: null, tokenSymbol: null };
  }

  const tokenSide = pair.baseToken?.address === mintAddress
    ? pair.baseToken
    : pair.quoteToken?.address === mintAddress
      ? pair.quoteToken
      : pair.baseToken ?? pair.quoteToken;

  return {
    tokenName: tokenSide?.name ?? null,
    tokenSymbol: tokenSide?.symbol ?? null,
  };
};

export const analyzeTokenHolderDistribution = async (input: {
  rpcUrl?: string;
  mintAddress: string;
  whaleThresholdPercent?: number;
  topOwnersLimit?: number;
}): Promise<TokenHolderDistribution> => {
  const rpcUrl = resolveRequiredRpcUrl(input.rpcUrl);
  const mintAddress = input.mintAddress.trim();
  const whaleThresholdPercent = normalizePositiveNumber(input.whaleThresholdPercent, DEFAULT_WHALE_THRESHOLD_PERCENT);
  const topOwnersLimit = Math.min(
    Math.max(1, Math.trunc(normalizePositiveNumber(input.topOwnersLimit, 5))),
    MAX_RETURNED_OWNERS,
  );
  const rpc = createRateLimitedSolanaRpc(rpcUrl);

  const [tokenSupplyResponse, largestAccountsResponse] = await Promise.all([
    (rpc as Record<string, unknown> & {
      getTokenSupply: (mint: string) => { send: () => Promise<unknown> };
    }).getTokenSupply(address(mintAddress)).send(),
    (rpc as Record<string, unknown> & {
      getTokenLargestAccounts: (mint: string) => { send: () => Promise<unknown> };
    }).getTokenLargestAccounts(address(mintAddress)).send(),
  ]);

  const tokenSupplyRecord = isRecord(tokenSupplyResponse) && isRecord(tokenSupplyResponse.value)
    ? tokenSupplyResponse.value
    : null;
  const totalSupplyRaw = typeof tokenSupplyRecord?.amount === "string" ? BigInt(tokenSupplyRecord.amount) : 0n;
  const decimals = typeof tokenSupplyRecord?.decimals === "number" ? tokenSupplyRecord.decimals : 0;

  const largestAccountsRecord = isRecord(largestAccountsResponse) && Array.isArray(largestAccountsResponse.value)
    ? largestAccountsResponse.value
    : [];
  const largestTokenAccounts = parseLargestTokenAccounts(largestAccountsRecord);
  const multipleAccounts = await getMultipleAccounts({
    rpcUrl,
    accounts: largestTokenAccounts.map((entry) => entry.address),
    encoding: "jsonParsed",
    chunkSize: SAFE_GET_MULTIPLE_ACCOUNTS_CHUNK_SIZE,
  });
  const accountLookup = new Map(multipleAccounts.accounts.map((entry) => [entry.address, entry.account]));

  const aggregatedOwners = aggregateOwners(largestTokenAccounts, accountLookup);
  const topOwners = aggregatedOwners.slice(0, topOwnersLimit).map((owner) => {
    const shareFraction = toShareFraction(owner.amountRaw, totalSupplyRaw);
    return {
      ownerAddress: owner.ownerAddress,
      amountRaw: owner.amountRaw.toString(),
      amountUiString: formatUiAmount(owner.amountRaw, decimals),
      shareFraction,
      sharePercent: shareFraction * 100,
      tokenAccountCount: owner.tokenAccounts.length,
      tokenAccounts: owner.tokenAccounts,
    } satisfies TokenHolderOwnerSummary;
  });

  const ownerShareFractions = aggregatedOwners.map((owner) => toShareFraction(owner.amountRaw, totalSupplyRaw));
  const whaleThresholdFraction = whaleThresholdPercent / 100;

  return {
    mintAddress,
    decimals,
    totalSupplyRaw: totalSupplyRaw.toString(),
    totalSupplyUiString: formatUiAmount(totalSupplyRaw, decimals),
    analyzedLargestAccountCount: largestTokenAccounts.length,
    distinctOwnerCount: aggregatedOwners.length,
    whaleThresholdPercent,
    whaleOwnerCount: ownerShareFractions.filter((share) => share >= whaleThresholdFraction).length,
    whaleOwnerCountAtOnePercent: ownerShareFractions.filter((share) => share >= 0.01).length,
    whaleOwnerCountAtFivePercent: ownerShareFractions.filter((share) => share >= 0.05).length,
    top1OwnerShareFraction: sumFractions(ownerShareFractions.slice(0, 1)),
    top5OwnerShareFraction: sumFractions(ownerShareFractions.slice(0, 5)),
    top10OwnerShareFraction: sumFractions(ownerShareFractions.slice(0, 10)),
    topOwners,
  };
};

export const createGetTokenHolderDistributionAction = (
  deps: GetTokenHolderDistributionDeps = {},
): Action<TokenHolderDistributionInput, TokenHolderDistribution> => {
  const loadHolderDistribution = deps.loadHolderDistribution ?? analyzeTokenHolderDistribution;

  return {
    name: "getTokenHolderDistribution",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: tokenHolderDistributionInputSchema,
    async execute(ctx, input) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();

      try {
        const data = await loadHolderDistribution({
          rpcUrl: ctx.rpcUrl,
          mintAddress: input.mintAddress,
          whaleThresholdPercent: input.whaleThresholdPercent,
          topOwnersLimit: input.topOwnersLimit,
        });

        return {
          ok: true,
          retryable: false,
          data,
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      } catch (error) {
        return {
          ok: false,
          retryable: isRetryableRpcError(error),
          error: error instanceof Error ? error.message : String(error),
          code: isRetryableRpcError(error) ? "GET_TOKEN_HOLDER_DISTRIBUTION_RATE_LIMITED" : "GET_TOKEN_HOLDER_DISTRIBUTION_FAILED",
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }
    },
  };
};

export const createRankDexscreenerTopTokenBoostsByWhalesAction = (
  deps: RankBoostedTokensByWhalesDeps = {},
): Action<RankBoostedTokensByWhalesInput, RankedBoostedTokensByWhalesResult> => {
  const loadTopTokenBoosts = deps.loadTopTokenBoosts ?? getDexscreenerTopTokenBoosts;
  const loadTokenPairs = deps.loadTokenPairs ?? (async (input: { tokenAddresses: string[] }) =>
    await getDexscreenerTokensByChain({ tokenAddresses: input.tokenAddresses }));
  const loadHolderDistribution = deps.loadHolderDistribution ?? analyzeTokenHolderDistribution;

  return {
    name: "rankDexscreenerTopTokenBoostsByWhales",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: rankBoostedTokensByWhalesInputSchema,
    async execute(ctx, input) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();
      const whaleThresholdPercent = normalizePositiveNumber(input.whaleThresholdPercent, DEFAULT_WHALE_THRESHOLD_PERCENT);
      const limit = Math.min(
        Math.max(1, Math.trunc(normalizePositiveNumber(input.limit, DEFAULT_ANALYZED_TOKEN_LIMIT))),
        MAX_ANALYZED_TOKEN_LIMIT,
      );
      const topOwnersLimit = Math.min(
        Math.max(1, Math.trunc(normalizePositiveNumber(input.topOwnersLimit, 5))),
        MAX_RETURNED_OWNERS,
      );

      try {
        const topBoosts = (await loadTopTokenBoosts()).slice(0, limit);
        const tokenAddresses = [...new Set(topBoosts.map((entry) => entry.tokenAddress.trim()).filter(Boolean))];
        const dexPairs = tokenAddresses.length > 0
          ? await loadTokenPairs({ tokenAddresses })
          : [];

        const ranking: RankedBoostedTokenWhaleEntry[] = [];
        for (const boost of topBoosts) {
          const mintAddress = boost.tokenAddress.trim();
          const pair = pickBestPairForMint(dexPairs, mintAddress);
          const tokenMetadata = readTokenMetadataFromPair(pair, mintAddress);
          const holderDistribution = await loadHolderDistribution({
            rpcUrl: ctx.rpcUrl,
            mintAddress,
            whaleThresholdPercent,
            topOwnersLimit,
          });

          ranking.push({
            ...holderDistribution,
            tokenAddress: mintAddress,
            tokenName: tokenMetadata.tokenName ?? boost.description ?? null,
            tokenSymbol: tokenMetadata.tokenSymbol,
            boostAmount: boost.amount,
            boostTotalAmount: boost.totalAmount,
            liquidityUsd: pair?.liquidity?.usd ?? null,
            volume24hUsd: toFiniteNumberOrNull(pair?.volume?.h24),
            marketCapUsd: toFiniteNumberOrNull(pair?.marketCap),
            fdvUsd: toFiniteNumberOrNull(pair?.fdv),
          });
        }

        ranking.sort((left, right) =>
          right.whaleOwnerCount - left.whaleOwnerCount
          || right.top10OwnerShareFraction - left.top10OwnerShareFraction
          || right.top5OwnerShareFraction - left.top5OwnerShareFraction
          || right.boostTotalAmount - left.boostTotalAmount);

        const data: RankedBoostedTokensByWhalesResult = {
          whaleThresholdPercent,
          analyzedTokenCount: ranking.length,
          ranking,
          winner: ranking[0] ?? null,
        };

        return {
          ok: true,
          retryable: false,
          data,
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      } catch (error) {
        return {
          ok: false,
          retryable: isRetryableRpcError(error),
          error: error instanceof Error ? error.message : String(error),
          code: isRetryableRpcError(error)
            ? "RANK_DEXSCREENER_TOP_TOKEN_BOOSTS_BY_WHALES_RATE_LIMITED"
            : "RANK_DEXSCREENER_TOP_TOKEN_BOOSTS_BY_WHALES_FAILED",
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }
    },
  };
};

export const getTokenHolderDistributionAction = createGetTokenHolderDistributionAction();
export const rankDexscreenerTopTokenBoostsByWhalesAction = createRankDexscreenerTopTokenBoostsByWhalesAction();
