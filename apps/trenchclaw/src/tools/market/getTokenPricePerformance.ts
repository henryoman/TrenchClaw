import { z } from "zod";

import type { Action } from "../../ai/contracts/types/action";
import {
  getGeckoTerminalPoolOhlcv,
  getGeckoTerminalTokenPools,
  isGeckoTerminalRetryableError,
  type GeckoTerminalPoolOhlcvResponse,
  type GeckoTerminalTokenPoolsResponse,
  type JsonObject,
  type JsonValue,
} from "../../solana/lib/clients/geckoterminal";

const nonEmptyStringSchema = z.string().trim().min(1);
const MAX_OHLC_ROWS = 1000;
const CANDLE_LOOKBACK_BUFFER = 3;

const getTokenPricePerformanceInputSchema = z.object({
  coinAddress: nonEmptyStringSchema,
  lookback: nonEmptyStringSchema,
});

type GetTokenPricePerformanceInput = z.output<typeof getTokenPricePerformanceInputSchema>;

interface ParsedLookback {
  raw: string;
  normalized: string;
  milliseconds: number;
  seconds: number;
}

interface CandlePlan {
  timeframe: "minute" | "hour" | "day";
  aggregate: 1 | 5 | 15 | 4 | 12;
  intervalSeconds: number;
  limit: number;
}

interface ParsedPoolToken {
  id: string;
  address: string;
  name: string | null;
  symbol: string | null;
}

interface ParsedTokenPool {
  poolAddress: string;
  poolName: string | null;
  reserveUsd: number | null;
  volume24hUsd: number | null;
  dexId: string | null;
  baseTokenPriceUsd: number | null;
  quoteTokenPriceUsd: number | null;
  baseToken: ParsedPoolToken | null;
  quoteToken: ParsedPoolToken | null;
}

interface ResolvedTokenPool extends ParsedTokenPool {
  token: ParsedPoolToken;
  tokenSide: "base" | "quote";
  currentPriceUsd: number;
}

type LookbackUnit = keyof typeof LOOKBACK_UNIT_MS;

interface OhlcvRow {
  openTimestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface VerifiedPoolHistory {
  pool: ResolvedTokenPool;
  rows: OhlcvRow[];
  historicalRow: OhlcvRow;
}

export interface TokenPricePerformanceResult {
  coinAddress: string;
  lookback: string;
  lookbackMs: number;
  currentPriceUsd: number;
  historicalPriceUsd: number;
  priceChangeUsd: number;
  priceChangePercent: number | null;
  currentPriceTimestamp: number;
  historicalPriceTimestamp: number;
  selectedPool: {
    address: string;
    name: string | null;
    dexId: string | null;
    reserveUsd: number | null;
    volume24hUsd: number | null;
    tokenSide: "base" | "quote";
  };
  token: {
    address: string;
    name: string | null;
    symbol: string | null;
  };
  candle: {
    timeframe: CandlePlan["timeframe"];
    aggregate: CandlePlan["aggregate"];
    intervalSeconds: number;
  };
}

interface GetTokenPricePerformanceDeps {
  now?: () => number;
  loadTokenPools?: (input: { coinAddress: string }) => Promise<GeckoTerminalTokenPoolsResponse>;
  loadPoolOhlcv?: (input: {
    poolAddress: string;
    coinAddress: string;
    timeframe: CandlePlan["timeframe"];
    aggregate: CandlePlan["aggregate"];
    limit: number;
  }) => Promise<GeckoTerminalPoolOhlcvResponse>;
}

const LOOKBACK_UNIT_MS: Record<string, number> = {
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  wk: 604_800_000,
  wks: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
};

const CANDLE_PLANS: readonly Omit<CandlePlan, "limit">[] = [
  { timeframe: "minute", aggregate: 1, intervalSeconds: 60 },
  { timeframe: "minute", aggregate: 5, intervalSeconds: 300 },
  { timeframe: "minute", aggregate: 15, intervalSeconds: 900 },
  { timeframe: "hour", aggregate: 1, intervalSeconds: 3_600 },
  { timeframe: "hour", aggregate: 4, intervalSeconds: 14_400 },
  { timeframe: "hour", aggregate: 12, intervalSeconds: 43_200 },
  { timeframe: "day", aggregate: 1, intervalSeconds: 86_400 },
] as const;

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);

const toFiniteNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim().length > 0 && Number.isFinite(Number(value))
      ? Number(value)
      : null;

const parseLookback = (value: string): ParsedLookback => {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks)$/u);
  if (!match) {
    throw new Error('Invalid `lookback`. Use values like `15m`, `1h`, `4h`, `24h`, or `7d`.');
  }

  const magnitude = Number(match[1]);
  const unit = match[2] as LookbackUnit;
  const unitMs = LOOKBACK_UNIT_MS[unit];
  if (unitMs === undefined) {
    throw new Error("Invalid `lookback` unit.");
  }
  const milliseconds = Math.round(magnitude * unitMs);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    throw new Error("Invalid `lookback`. The resolved duration must be greater than zero.");
  }

  const normalizedUnit = unit.startsWith("m")
    ? "m"
    : unit.startsWith("h")
      ? "h"
      : unit.startsWith("d")
        ? "d"
        : "w";

  return {
    raw: value,
    normalized: `${Number.isInteger(magnitude) ? magnitude : Number(magnitude.toFixed(3))}${normalizedUnit}`,
    milliseconds,
    seconds: Math.max(1, Math.round(milliseconds / 1000)),
  };
};

const planCandleLookup = (lookbackSeconds: number): CandlePlan => {
  for (const candidate of CANDLE_PLANS) {
    const requiredRows = Math.ceil(lookbackSeconds / candidate.intervalSeconds) + CANDLE_LOOKBACK_BUFFER;
    if (requiredRows <= MAX_OHLC_ROWS) {
      return {
        ...candidate,
        limit: Math.max(CANDLE_LOOKBACK_BUFFER, requiredRows),
      };
    }
  }

  throw new Error("Requested `lookback` is too large for the supported historical candle window.");
};

const getRelationshipId = (node: JsonObject | null, key: "base_token" | "quote_token" | "dex"): string | null => {
  if (!node) {
    return null;
  }
  const relation = isJsonObject(node[key]) ? node[key] : null;
  const data = relation && isJsonObject(relation.data) ? relation.data : null;
  return typeof data?.id === "string" && data.id.trim().length > 0 ? data.id : null;
};

const parseIncludedTokens = (payload: JsonObject): Map<string, ParsedPoolToken> => {
  const included = Array.isArray(payload.included) ? payload.included : [];
  const tokens = new Map<string, ParsedPoolToken>();
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

const parseTokenPools = (payload: JsonObject): ParsedTokenPool[] => {
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
      baseTokenPriceUsd: toFiniteNumberOrNull(attributes?.base_token_price_usd),
      quoteTokenPriceUsd: toFiniteNumberOrNull(attributes?.quote_token_price_usd),
      baseToken: baseTokenId ? tokenById.get(baseTokenId) ?? null : null,
      quoteToken: quoteTokenId ? tokenById.get(quoteTokenId) ?? null : null,
    }] satisfies ParsedTokenPool[];
  });
};

const resolvePoolCandidate = (
  pool: ParsedTokenPool,
  normalizedCoinAddress: string,
): ResolvedTokenPool | null => {
  if (pool.baseToken?.address === normalizedCoinAddress && pool.baseTokenPriceUsd !== null) {
    return {
      ...pool,
      token: pool.baseToken,
      tokenSide: "base",
      currentPriceUsd: pool.baseTokenPriceUsd,
    };
  }

  if (pool.quoteToken?.address === normalizedCoinAddress && pool.quoteTokenPriceUsd !== null) {
    return {
      ...pool,
      token: pool.quoteToken,
      tokenSide: "quote",
      currentPriceUsd: pool.quoteTokenPriceUsd,
    };
  }

  return null;
};

const rankResolvedPoolCandidates = (left: ResolvedTokenPool, right: ResolvedTokenPool): number => {
  const volumeDelta = (right.volume24hUsd ?? 0) - (left.volume24hUsd ?? 0);
  if (volumeDelta !== 0) {
    return volumeDelta;
  }

  return (right.reserveUsd ?? 0) - (left.reserveUsd ?? 0);
};

const collectPoolCandidates = (pools: ParsedTokenPool[], coinAddress: string): ResolvedTokenPool[] => {
  const normalizedCoinAddress = coinAddress.trim();

  return pools.flatMap<ResolvedTokenPool>((pool) => {
    const candidate = resolvePoolCandidate(pool, normalizedCoinAddress);
    return candidate ? [candidate] : [];
  });
};

const resolveBestPool = (pools: ParsedTokenPool[], coinAddress: string): ResolvedTokenPool | null => {
  const candidates = collectPoolCandidates(pools, coinAddress);

  if (candidates.length === 0) {
    return null;
  }

  return candidates.toSorted(rankResolvedPoolCandidates)[0] ?? null;
};

const rankPoolCandidates = (pools: ParsedTokenPool[], coinAddress: string): ResolvedTokenPool[] =>
  collectPoolCandidates(pools, coinAddress).toSorted(rankResolvedPoolCandidates);

const parseOhlcvRows = (payload: JsonObject): OhlcvRow[] => {
  const dataNode = isJsonObject(payload.data) ? payload.data : null;
  const attributes = dataNode && isJsonObject(dataNode.attributes) ? dataNode.attributes : null;
  const rows = Array.isArray(attributes?.ohlcv_list) ? attributes.ohlcv_list : [];
  return rows.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 6) {
      return [];
    }
    const openTimestamp = toFiniteNumberOrNull(row[0]);
    const open = toFiniteNumberOrNull(row[1]);
    const high = toFiniteNumberOrNull(row[2]);
    const low = toFiniteNumberOrNull(row[3]);
    const close = toFiniteNumberOrNull(row[4]);
    const volume = toFiniteNumberOrNull(row[5]);
    if (
      openTimestamp === null
      || open === null
      || high === null
      || low === null
      || close === null
      || volume === null
    ) {
      return [];
    }
    return [{
      openTimestamp,
      open,
      high,
      low,
      close,
      volume,
    }];
  }).toSorted((left, right) => right.openTimestamp - left.openTimestamp);
};

const verifyPoolHistory = (input: {
  pool: ResolvedTokenPool;
  rows: OhlcvRow[];
  currentPriceTimestamp: number;
  targetTimestampSeconds: number;
  candlePlan: CandlePlan;
}): VerifiedPoolHistory | null => {
  if (input.rows.length === 0) {
    return null;
  }

  const latestRow = input.rows[0];
  if (!latestRow) {
    return null;
  }

  const nowSeconds = Math.floor(input.currentPriceTimestamp / 1000);
  const latestRowAgeSeconds = Math.max(0, nowSeconds - latestRow.openTimestamp);
  const maxLatestRowAgeSeconds = Math.max(input.candlePlan.intervalSeconds * 3, 5 * 60);
  if (latestRowAgeSeconds > maxLatestRowAgeSeconds) {
    return null;
  }

  const historicalRow = input.rows.find((row) => row.openTimestamp <= input.targetTimestampSeconds);
  if (!historicalRow) {
    return null;
  }

  const maxHistoricalGapSeconds = input.candlePlan.intervalSeconds * 3;
  if (input.targetTimestampSeconds - historicalRow.openTimestamp > maxHistoricalGapSeconds) {
    return null;
  }

  return {
    pool: input.pool,
    rows: input.rows,
    historicalRow,
  };
};

const createDefaultDeps = (): Required<GetTokenPricePerformanceDeps> => ({
  now: () => Date.now(),
  loadTokenPools: async (input) =>
    await getGeckoTerminalTokenPools({
      tokenAddress: input.coinAddress,
      include: ["base_token", "quote_token", "dex"],
      sort: "h24_volume_usd_liquidity_desc",
    }),
  loadPoolOhlcv: async (input) =>
    await getGeckoTerminalPoolOhlcv({
      poolAddress: input.poolAddress,
      timeframe: input.timeframe,
      aggregate: input.aggregate,
      limit: input.limit,
      currency: "usd",
      includeEmptyIntervals: false,
      token: input.coinAddress,
    }),
});

export const createGetTokenPricePerformanceAction = (
  deps: GetTokenPricePerformanceDeps = {},
): Action<GetTokenPricePerformanceInput, TokenPricePerformanceResult> => {
  const runtimeDeps = {
    ...createDefaultDeps(),
    ...deps,
  };

  return {
    name: "getTokenPricePerformance",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: getTokenPricePerformanceInputSchema,
    async execute(_ctx, rawInput) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();

      try {
        const input = getTokenPricePerformanceInputSchema.parse(rawInput);
        const lookback = parseLookback(input.lookback);
        const candlePlan = planCandleLookup(lookback.seconds);
        const currentPriceTimestamp = runtimeDeps.now();
        const targetTimestampSeconds = Math.max(0, Math.floor(currentPriceTimestamp / 1000) - lookback.seconds);

        const poolsResponse = await runtimeDeps.loadTokenPools({
          coinAddress: input.coinAddress,
        });
        const parsedPools = parseTokenPools(poolsResponse.payload);
        const poolCandidates = rankPoolCandidates(parsedPools, input.coinAddress);
        const resolvedPool = resolveBestPool(parsedPools, input.coinAddress);
        if (!resolvedPool || poolCandidates.length === 0) {
          throw new Error(`No priced GeckoTerminal pool was found for coin ${input.coinAddress}.`);
        }

        let verifiedHistory: VerifiedPoolHistory | null = null;
        for (const candidate of poolCandidates.slice(0, 5)) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- stop at the first pool with a verified history window.
          const ohlcvResponse = await runtimeDeps.loadPoolOhlcv({
            poolAddress: candidate.poolAddress,
            coinAddress: input.coinAddress,
            timeframe: candlePlan.timeframe,
            aggregate: candlePlan.aggregate,
            limit: candlePlan.limit,
          });
          const rows = parseOhlcvRows(ohlcvResponse.payload);
          verifiedHistory = verifyPoolHistory({
            pool: candidate,
            rows,
            currentPriceTimestamp,
            targetTimestampSeconds,
            candlePlan,
          });
          if (verifiedHistory) {
            break;
          }
        }

        if (!verifiedHistory) {
          throw new Error(`Historical price data is unavailable for lookback ${lookback.normalized}.`);
        }

        const historicalPriceUsd = verifiedHistory.historicalRow.close;
        const currentPriceUsd = verifiedHistory.pool.currentPriceUsd;
        const priceChangeUsd = currentPriceUsd - historicalPriceUsd;
        const priceChangePercent = historicalPriceUsd === 0
          ? null
          : ((currentPriceUsd - historicalPriceUsd) / historicalPriceUsd) * 100;
        const historicalPriceTimestamp = Math.min(
          currentPriceTimestamp,
          (verifiedHistory.historicalRow.openTimestamp + candlePlan.intervalSeconds) * 1000,
        );

        return {
          ok: true,
          retryable: false,
          data: {
            coinAddress: input.coinAddress,
            lookback: lookback.normalized,
            lookbackMs: lookback.milliseconds,
            currentPriceUsd,
            historicalPriceUsd,
            priceChangeUsd,
            priceChangePercent,
            currentPriceTimestamp,
            historicalPriceTimestamp,
            selectedPool: {
              address: verifiedHistory.pool.poolAddress,
              name: verifiedHistory.pool.poolName,
              dexId: verifiedHistory.pool.dexId,
              reserveUsd: verifiedHistory.pool.reserveUsd,
              volume24hUsd: verifiedHistory.pool.volume24hUsd,
              tokenSide: verifiedHistory.pool.tokenSide,
            },
            token: {
              address: verifiedHistory.pool.token.address,
              name: verifiedHistory.pool.token.name,
              symbol: verifiedHistory.pool.token.symbol,
            },
            candle: {
              timeframe: candlePlan.timeframe,
              aggregate: candlePlan.aggregate,
              intervalSeconds: candlePlan.intervalSeconds,
            },
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
          code: retryable ? "TOKEN_PRICE_PERFORMANCE_RETRYABLE" : "TOKEN_PRICE_PERFORMANCE_FAILED",
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }
    },
  };
};

export const getTokenPricePerformanceAction = createGetTokenPricePerformanceAction();
