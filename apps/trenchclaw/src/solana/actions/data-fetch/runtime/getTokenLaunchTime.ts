import { z } from "zod";

import type { Action } from "../../../../ai/contracts/types/action";
import {
  getDexscreenerTokenPairsByChain,
  type DexscreenerPairInfo,
} from "../api/dexscreener";
import {
  getGeckoTerminalTokenPools,
  isGeckoTerminalRetryableError,
  type GeckoTerminalTokenPoolsResponse,
  type JsonObject,
  type JsonValue,
} from "../api/geckoterminal";

const nonEmptyStringSchema = z.string().trim().min(1);
const launchTypeSchema = z.enum(["first_pool", "main_pool"]);

const getTokenLaunchTimeInputSchema = z.object({
  coinAddress: nonEmptyStringSchema,
  type: launchTypeSchema.default("main_pool"),
});

type GetTokenLaunchTimeInput = z.output<typeof getTokenLaunchTimeInputSchema>;
type LaunchType = z.output<typeof launchTypeSchema>;

interface TokenMetadata {
  address: string;
  name: string | null;
  symbol: string | null;
}

interface LaunchCandidate {
  source: "dexscreener" | "geckoterminal";
  createdAtMs: number;
  poolAddress: string;
  poolName: string | null;
  dexId: string | null;
  liquidityUsd: number | null;
  reserveUsd: number | null;
  volume24hUsd: number | null;
  tokenSide: "base" | "quote";
  token: TokenMetadata;
}

export interface TokenLaunchTimeResult {
  coinAddress: string;
  type: LaunchType;
  launchTimestamp: number;
  launchIso: string;
  source: LaunchCandidate["source"];
  observedPoolCount: number;
  selectedPool: {
    address: string;
    name: string | null;
    dexId: string | null;
    liquidityUsd: number | null;
    reserveUsd: number | null;
    volume24hUsd: number | null;
    tokenSide: "base" | "quote";
  };
  token: TokenMetadata;
}

interface GeckoPoolToken extends TokenMetadata {
  id: string;
}

interface GeckoPoolRecord {
  poolAddress: string;
  poolName: string | null;
  reserveUsd: number | null;
  volume24hUsd: number | null;
  dexId: string | null;
  poolCreatedAtMs: number | null;
  baseToken: GeckoPoolToken | null;
  quoteToken: GeckoPoolToken | null;
}

interface GetTokenLaunchTimeDeps {
  loadDexPairs?: (input: { coinAddress: string }) => Promise<DexscreenerPairInfo[]>;
  loadGeckoPools?: (input: { coinAddress: string }) => Promise<GeckoTerminalTokenPoolsResponse>;
}

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);

const toFiniteNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim().length > 0 && Number.isFinite(Number(value))
      ? Number(value)
      : null;

const parseTimestampMs = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value >= 1_000_000_000_000 ? Math.trunc(value) : Math.trunc(value * 1000);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric >= 1_000_000_000_000 ? Math.trunc(numeric) : Math.trunc(numeric * 1000);
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getRelationshipId = (node: JsonObject | null, key: "base_token" | "quote_token" | "dex"): string | null => {
  if (!node) {
    return null;
  }
  const relation = isJsonObject(node[key]) ? node[key] : null;
  const data = relation && isJsonObject(relation.data) ? relation.data : null;
  return typeof data?.id === "string" && data.id.trim().length > 0 ? data.id : null;
};

const parseIncludedTokens = (payload: JsonObject): Map<string, GeckoPoolToken> => {
  const included = Array.isArray(payload.included) ? payload.included : [];
  const tokens = new Map<string, GeckoPoolToken>();
  for (const entry of included) {
    if (!isJsonObject(entry) || entry.type !== "token" || typeof entry.id !== "string") {
      continue;
    }
    const attributes = isJsonObject(entry.attributes) ? entry.attributes : null;
    const address = typeof attributes?.address === "string" ? attributes.address.trim() : "";
    if (!address) {
      continue;
    }
    tokens.set(entry.id, {
      id: entry.id,
      address,
      name: typeof attributes?.name === "string" && attributes.name.trim().length > 0 ? attributes.name : null,
      symbol: typeof attributes?.symbol === "string" && attributes.symbol.trim().length > 0 ? attributes.symbol : null,
    });
  }
  return tokens;
};

const parseGeckoPools = (payload: JsonObject): GeckoPoolRecord[] => {
  const tokenById = parseIncludedTokens(payload);
  const data = Array.isArray(payload.data) ? payload.data : [];

  return data.flatMap((entry) => {
    if (!isJsonObject(entry)) {
      return [];
    }

    const attributes = isJsonObject(entry.attributes) ? entry.attributes : null;
    const relationships = isJsonObject(entry.relationships) ? entry.relationships : null;
    const poolAddress = typeof attributes?.address === "string" ? attributes.address.trim() : "";
    if (!poolAddress) {
      return [];
    }

    const baseTokenId = getRelationshipId(relationships, "base_token");
    const quoteTokenId = getRelationshipId(relationships, "quote_token");
    const dexId = getRelationshipId(relationships, "dex");

    return [{
      poolAddress,
      poolName: typeof attributes?.name === "string" && attributes.name.trim().length > 0 ? attributes.name : null,
      reserveUsd: toFiniteNumberOrNull(attributes?.reserve_in_usd),
      volume24hUsd: isJsonObject(attributes?.volume_usd) ? toFiniteNumberOrNull(attributes.volume_usd.h24) : null,
      dexId,
      poolCreatedAtMs: parseTimestampMs(attributes?.pool_created_at ?? attributes?.created_at),
      baseToken: baseTokenId ? tokenById.get(baseTokenId) ?? null : null,
      quoteToken: quoteTokenId ? tokenById.get(quoteTokenId) ?? null : null,
    }] satisfies GeckoPoolRecord[];
  });
};

const getTokenSideFromDexPair = (pair: DexscreenerPairInfo, coinAddress: string): {
  tokenSide: "base" | "quote";
  token: TokenMetadata;
} | null => {
  if (pair.baseToken?.address === coinAddress) {
    return {
      tokenSide: "base",
      token: {
        address: pair.baseToken.address,
        name: pair.baseToken.name ?? null,
        symbol: pair.baseToken.symbol ?? null,
      },
    };
  }

  if (pair.quoteToken?.address === coinAddress) {
    return {
      tokenSide: "quote",
      token: {
        address: pair.quoteToken.address,
        name: pair.quoteToken.name ?? null,
        symbol: pair.quoteToken.symbol ?? null,
      },
    };
  }

  return null;
};

const collectDexLaunchCandidates = (pairs: DexscreenerPairInfo[], coinAddress: string): LaunchCandidate[] =>
  pairs.flatMap((pair) => {
    const tokenSide = getTokenSideFromDexPair(pair, coinAddress);
    const createdAtMs = parseTimestampMs(pair.pairCreatedAt);
    if (!tokenSide || createdAtMs === null) {
      return [];
    }

    return [{
      source: "dexscreener" as const,
      createdAtMs,
      poolAddress: pair.pairAddress,
      poolName: null,
      dexId: pair.dexId ?? null,
      liquidityUsd: toFiniteNumberOrNull(pair.liquidity?.usd),
      reserveUsd: null,
      volume24hUsd: toFiniteNumberOrNull(pair.volume?.h24),
      tokenSide: tokenSide.tokenSide,
      token: tokenSide.token,
    }];
  });

const collectGeckoLaunchCandidates = (pools: GeckoPoolRecord[], coinAddress: string): LaunchCandidate[] =>
  pools.flatMap((pool) => {
    const candidates: LaunchCandidate[] = [];

    if (pool.poolCreatedAtMs === null) {
      return candidates;
    }

    if (pool.baseToken?.address === coinAddress) {
      candidates.push({
        source: "geckoterminal" as const,
        createdAtMs: pool.poolCreatedAtMs,
        poolAddress: pool.poolAddress,
        poolName: pool.poolName,
        dexId: pool.dexId,
        liquidityUsd: pool.reserveUsd,
        reserveUsd: pool.reserveUsd,
        volume24hUsd: pool.volume24hUsd,
        tokenSide: "base" as const,
        token: {
          address: pool.baseToken.address,
          name: pool.baseToken.name,
          symbol: pool.baseToken.symbol,
        },
      });
    }

    if (pool.quoteToken?.address === coinAddress) {
      candidates.push({
        source: "geckoterminal" as const,
        createdAtMs: pool.poolCreatedAtMs,
        poolAddress: pool.poolAddress,
        poolName: pool.poolName,
        dexId: pool.dexId,
        liquidityUsd: pool.reserveUsd,
        reserveUsd: pool.reserveUsd,
        volume24hUsd: pool.volume24hUsd,
        tokenSide: "quote" as const,
        token: {
          address: pool.quoteToken.address,
          name: pool.quoteToken.name,
          symbol: pool.quoteToken.symbol,
        },
      });
    }

    return candidates;
  });

const compareByMainPoolPriority = (left: LaunchCandidate, right: LaunchCandidate): number => {
  const liquidityDelta = (right.liquidityUsd ?? 0) - (left.liquidityUsd ?? 0);
  if (liquidityDelta !== 0) {
    return liquidityDelta;
  }

  const volumeDelta = (right.volume24hUsd ?? 0) - (left.volume24hUsd ?? 0);
  if (volumeDelta !== 0) {
    return volumeDelta;
  }

  return left.createdAtMs - right.createdAtMs;
};

const compareByFirstPoolPriority = (left: LaunchCandidate, right: LaunchCandidate): number => {
  const createdAtDelta = left.createdAtMs - right.createdAtMs;
  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return compareByMainPoolPriority(left, right);
};

const pickLaunchCandidate = (candidates: LaunchCandidate[], type: LaunchType): LaunchCandidate | null => {
  if (candidates.length === 0) {
    return null;
  }

  const comparator = type === "first_pool" ? compareByFirstPoolPriority : compareByMainPoolPriority;
  return candidates.toSorted(comparator)[0] ?? null;
};

const createDefaultDeps = (): Required<GetTokenLaunchTimeDeps> => ({
  loadDexPairs: async (input) =>
    await getDexscreenerTokenPairsByChain({
      tokenAddress: input.coinAddress,
    }),
  loadGeckoPools: async (input) =>
    await getGeckoTerminalTokenPools({
      tokenAddress: input.coinAddress,
      include: ["base_token", "quote_token", "dex"],
      sort: "h24_volume_usd_liquidity_desc",
    }),
});

export const createGetTokenLaunchTimeAction = (
  deps: GetTokenLaunchTimeDeps = {},
): Action<GetTokenLaunchTimeInput, TokenLaunchTimeResult> => {
  const runtimeDeps = {
    ...createDefaultDeps(),
    ...deps,
  };

  return {
    name: "getTokenLaunchTime",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: getTokenLaunchTimeInputSchema,
    async execute(_ctx, rawInput) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();

      try {
        const input = getTokenLaunchTimeInputSchema.parse(rawInput);
        const launchType = input.type;
        let observedPoolCount = 0;

        try {
          const dexPairs = await runtimeDeps.loadDexPairs({ coinAddress: input.coinAddress });
          const dexCandidates = collectDexLaunchCandidates(dexPairs, input.coinAddress);
          observedPoolCount = dexCandidates.length;
          const selectedDexCandidate = pickLaunchCandidate(dexCandidates, launchType);
          if (selectedDexCandidate) {
            return {
              ok: true,
              retryable: false,
              data: {
                coinAddress: input.coinAddress,
                type: launchType,
                launchTimestamp: selectedDexCandidate.createdAtMs,
                launchIso: new Date(selectedDexCandidate.createdAtMs).toISOString(),
                source: selectedDexCandidate.source,
                observedPoolCount,
                selectedPool: {
                  address: selectedDexCandidate.poolAddress,
                  name: selectedDexCandidate.poolName,
                  dexId: selectedDexCandidate.dexId,
                  liquidityUsd: selectedDexCandidate.liquidityUsd,
                  reserveUsd: selectedDexCandidate.reserveUsd,
                  volume24hUsd: selectedDexCandidate.volume24hUsd,
                  tokenSide: selectedDexCandidate.tokenSide,
                },
                token: selectedDexCandidate.token,
              },
              durationMs: Date.now() - startedAt,
              timestamp: Date.now(),
              idempotencyKey,
            };
          }
        } catch {
          // Fall back to GeckoTerminal when DexScreener does not resolve a usable launch timestamp.
        }

        const geckoPoolsResponse = await runtimeDeps.loadGeckoPools({
          coinAddress: input.coinAddress,
        });
        const geckoPools = parseGeckoPools(geckoPoolsResponse.payload);
        const geckoCandidates = collectGeckoLaunchCandidates(geckoPools, input.coinAddress);
        observedPoolCount = Math.max(observedPoolCount, geckoCandidates.length);
        const selectedGeckoCandidate = pickLaunchCandidate(geckoCandidates, launchType);
        if (!selectedGeckoCandidate) {
          throw new Error(`No launch-timestamped liquidity pool was found for coin ${input.coinAddress}.`);
        }

        return {
          ok: true,
          retryable: false,
          data: {
            coinAddress: input.coinAddress,
            type: launchType,
            launchTimestamp: selectedGeckoCandidate.createdAtMs,
            launchIso: new Date(selectedGeckoCandidate.createdAtMs).toISOString(),
            source: selectedGeckoCandidate.source,
            observedPoolCount,
            selectedPool: {
              address: selectedGeckoCandidate.poolAddress,
              name: selectedGeckoCandidate.poolName,
              dexId: selectedGeckoCandidate.dexId,
              liquidityUsd: selectedGeckoCandidate.liquidityUsd,
              reserveUsd: selectedGeckoCandidate.reserveUsd,
              volume24hUsd: selectedGeckoCandidate.volume24hUsd,
              tokenSide: selectedGeckoCandidate.tokenSide,
            },
            token: selectedGeckoCandidate.token,
          },
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      } catch (error) {
        const retryable = isGeckoTerminalRetryableError(error);
        return {
          ok: false,
          retryable,
          error: error instanceof Error ? error.message : String(error),
          code: retryable ? "TOKEN_LAUNCH_TIME_RETRYABLE" : "TOKEN_LAUNCH_TIME_FAILED",
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }
    },
  };
};

export const getTokenLaunchTimeAction = createGetTokenLaunchTimeAction();
