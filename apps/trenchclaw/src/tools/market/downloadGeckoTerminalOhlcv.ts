import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { Action } from "../../ai/contracts/types/action";
import { ensureInstanceLayout } from "../../runtime/instance/layout";
import { resolveRequiredActiveInstanceIdSync } from "../../runtime/instance/state";
import { resolveInstanceWorkspaceGeckoTerminalOhlcvRoot } from "../../runtime/instance/workspace";
import { toRuntimeContractRelativePath } from "../../runtime/runtimePaths";
import {
  getGeckoTerminalTokenPools,
  getGeckoTerminalPoolOhlcv,
  isGeckoTerminalRetryableError,
  type GeckoTerminalPoolOhlcvResponse,
  type GeckoTerminalTokenPoolsResponse,
  type JsonObject,
  type JsonValue,
} from "../../solana/lib/clients/geckoterminal";

const timeframeSchema = z.enum(["minute", "hour", "day"]);

const aggregateSchema = z.number().int().positive().optional();

const downloadGeckoTerminalOhlcvInputSchema = z.object({
  coinAddress: z.string().trim().min(1),
  timeframe: timeframeSchema,
  aggregate: aggregateSchema,
  beforeTimestamp: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(1000).default(100),
  currency: z.enum(["usd", "token"]).optional(),
  includeEmptyIntervals: z.boolean().default(false),
}).superRefine((value, ctx) => {
  const allowedAggregatesByTimeframe: Record<z.infer<typeof timeframeSchema>, readonly number[]> = {
    minute: [1, 5, 15],
    hour: [1, 4, 12],
    day: [1],
  };

  if (typeof value.aggregate === "number" && !allowedAggregatesByTimeframe[value.timeframe].includes(value.aggregate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["aggregate"],
      message: `Invalid aggregate for ${value.timeframe}. Allowed values: ${allowedAggregatesByTimeframe[value.timeframe].join(", ")}`,
    });
  }
});

type DownloadGeckoTerminalOhlcvInput = z.output<typeof downloadGeckoTerminalOhlcvInputSchema>;

interface DownloadGeckoTerminalOhlcvOutput {
  instanceId: string;
  coinAddress: string;
  network: "solana";
  source: "geckoterminal";
  requestUrl: string;
  downloadedAt: string;
  candleCount: number;
  latestOpenTimestamp: number | null;
  earliestOpenTimestamp: number | null;
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
  outputPath: string;
  runtimePath: string;
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
  baseToken: ParsedPoolToken | null;
  quoteToken: ParsedPoolToken | null;
}

interface ResolvedPoolCandidate extends ParsedTokenPool {
  token: ParsedPoolToken;
  tokenSide: "base" | "quote";
}

interface DownloadGeckoTerminalOhlcvDeps {
  loadTokenPools?: (input: { coinAddress: string }) => Promise<GeckoTerminalTokenPoolsResponse>;
  loadPoolOhlcv?: (input: {
    poolAddress: string;
    coinAddress: string;
    timeframe: DownloadGeckoTerminalOhlcvInput["timeframe"];
    aggregate: DownloadGeckoTerminalOhlcvInput["aggregate"];
    beforeTimestamp: DownloadGeckoTerminalOhlcvInput["beforeTimestamp"];
    limit: DownloadGeckoTerminalOhlcvInput["limit"];
    currency: DownloadGeckoTerminalOhlcvInput["currency"];
    includeEmptyIntervals: DownloadGeckoTerminalOhlcvInput["includeEmptyIntervals"];
  }) => Promise<GeckoTerminalPoolOhlcvResponse>;
}

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);

const asNumericTimestamp = (value: JsonValue | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const toFiniteNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim().length > 0 && Number.isFinite(Number(value))
      ? Number(value)
      : null;

const getOhlcvRows = (payload: JsonObject): JsonValue[] => {
  const dataNode = isJsonObject(payload.data) ? payload.data : null;
  const attributesNode = dataNode && isJsonObject(dataNode.attributes) ? dataNode.attributes : null;
  return Array.isArray(attributesNode?.ohlcv_list) ? attributesNode.ohlcv_list : [];
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
      baseToken: baseTokenId ? tokenById.get(baseTokenId) ?? null : null,
      quoteToken: quoteTokenId ? tokenById.get(quoteTokenId) ?? null : null,
    }] satisfies ParsedTokenPool[];
  });
};

const resolvePoolCandidate = (pool: ParsedTokenPool, normalizedCoinAddress: string): ResolvedPoolCandidate | null => {
  if (pool.baseToken?.address === normalizedCoinAddress) {
    return {
      ...pool,
      token: pool.baseToken,
      tokenSide: "base",
    };
  }

  if (pool.quoteToken?.address === normalizedCoinAddress) {
    return {
      ...pool,
      token: pool.quoteToken,
      tokenSide: "quote",
    };
  }

  return null;
};

const rankResolvedPoolCandidates = (left: ResolvedPoolCandidate, right: ResolvedPoolCandidate): number => {
  const reserveDelta = (right.reserveUsd ?? 0) - (left.reserveUsd ?? 0);
  if (reserveDelta !== 0) {
    return reserveDelta;
  }

  return (right.volume24hUsd ?? 0) - (left.volume24hUsd ?? 0);
};

const rankPoolCandidates = (pools: ParsedTokenPool[], coinAddress: string): ResolvedPoolCandidate[] => {
  const normalizedCoinAddress = coinAddress.trim();
  return pools
    .flatMap<ResolvedPoolCandidate>((pool) => {
      const candidate = resolvePoolCandidate(pool, normalizedCoinAddress);
      return candidate ? [candidate] : [];
    })
    .toSorted(rankResolvedPoolCandidates);
};

const sanitizePathSegment = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80) || "segment";

const createArtifactFileName = (
  input: DownloadGeckoTerminalOhlcvInput,
  selectedPoolAddress: string,
  downloadedAtIso: string,
): string => {
  const timestampSegment = downloadedAtIso.replace(/[:.]/gu, "-");
  const aggregateSegment = typeof input.aggregate === "number" ? `agg-${input.aggregate}` : "agg-default";
  return `${sanitizePathSegment(input.coinAddress)}-${sanitizePathSegment(selectedPoolAddress)}-${input.timeframe}-${aggregateSegment}-${timestampSegment}.json`;
};

const createDefaultDeps = (): Required<DownloadGeckoTerminalOhlcvDeps> => ({
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
      beforeTimestamp: input.beforeTimestamp,
      limit: input.limit,
      currency: input.currency,
      includeEmptyIntervals: input.includeEmptyIntervals,
      token: input.coinAddress,
    }),
});

export const createDownloadGeckoTerminalOhlcvAction = (
  deps: DownloadGeckoTerminalOhlcvDeps = {},
): Action<DownloadGeckoTerminalOhlcvInput, DownloadGeckoTerminalOhlcvOutput> => {
  const runtimeDeps = {
    ...createDefaultDeps(),
    ...deps,
  };

  return {
    name: "downloadGeckoTerminalOhlcv",
    category: "data-based",
    inputSchema: downloadGeckoTerminalOhlcvInputSchema,
    async execute(_ctx, rawInput) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();

      try {
        const input = downloadGeckoTerminalOhlcvInputSchema.parse(rawInput);
        const activeInstanceId = resolveRequiredActiveInstanceIdSync(
          "No active instance selected. GeckoTerminal OHLC downloads are instance-scoped.",
        );
        await ensureInstanceLayout(activeInstanceId);

        const poolsResponse = await runtimeDeps.loadTokenPools({
          coinAddress: input.coinAddress,
        });
        const parsedPools = parseTokenPools(poolsResponse.payload);
        const poolCandidates = rankPoolCandidates(parsedPools, input.coinAddress);
        const selectedPool = poolCandidates[0];
        if (!selectedPool) {
          throw new Error(`No GeckoTerminal liquidity pool was found for coin ${input.coinAddress}.`);
        }

        const { payload, requestUrl } = await runtimeDeps.loadPoolOhlcv({
          poolAddress: selectedPool.poolAddress,
          coinAddress: input.coinAddress,
          timeframe: input.timeframe,
          aggregate: input.aggregate,
          beforeTimestamp: input.beforeTimestamp,
          limit: input.limit,
          currency: input.currency,
          includeEmptyIntervals: input.includeEmptyIntervals,
        });

        const downloadedAt = new Date().toISOString();
        const outputDirectory = resolveInstanceWorkspaceGeckoTerminalOhlcvRoot(activeInstanceId);
        const outputPath = path.join(outputDirectory, createArtifactFileName(input, selectedPool.poolAddress, downloadedAt));
        const ohlcvRows = getOhlcvRows(payload);
        const latestRow = Array.isArray(ohlcvRows[0]) ? ohlcvRows[0] : null;
        const earliestRowCandidate = ohlcvRows.at(-1);
        const earliestRow = Array.isArray(earliestRowCandidate) ? earliestRowCandidate : null;
        const latestOpenTimestamp = latestRow ? asNumericTimestamp(latestRow[0]) : null;
        const earliestOpenTimestamp = earliestRow ? asNumericTimestamp(earliestRow[0]) : null;

        const artifactDocument = {
          artifactType: "geckoterminal-ohlcv-download",
          source: "geckoterminal",
          network: "solana",
          downloadedAt,
          request: {
            coinAddress: input.coinAddress,
            timeframe: input.timeframe,
            aggregate: input.aggregate ?? null,
            beforeTimestamp: input.beforeTimestamp ?? null,
            limit: input.limit,
            currency: input.currency ?? null,
            includeEmptyIntervals: input.includeEmptyIntervals,
          },
          poolResolution: {
            tokenPoolsRequestUrl: poolsResponse.requestUrl,
            candidateCount: poolCandidates.length,
            selectedPool: {
              address: selectedPool.poolAddress,
              name: selectedPool.poolName,
              dexId: selectedPool.dexId,
              reserveUsd: selectedPool.reserveUsd,
              volume24hUsd: selectedPool.volume24hUsd,
              tokenSide: selectedPool.tokenSide,
            },
            token: {
              address: selectedPool.token.address,
              name: selectedPool.token.name,
              symbol: selectedPool.token.symbol,
            },
          },
          requestUrl,
          response: payload,
        };

        await mkdir(outputDirectory, { recursive: true });
        await writeFile(outputPath, `${JSON.stringify(artifactDocument, null, 2)}\n`, "utf8");

        return {
          ok: true,
          retryable: false,
          data: {
            instanceId: activeInstanceId,
            coinAddress: input.coinAddress,
            network: "solana",
            source: "geckoterminal",
            requestUrl,
            downloadedAt,
            candleCount: ohlcvRows.length,
            latestOpenTimestamp,
            earliestOpenTimestamp,
            selectedPool: {
              address: selectedPool.poolAddress,
              name: selectedPool.poolName,
              dexId: selectedPool.dexId,
              reserveUsd: selectedPool.reserveUsd,
              volume24hUsd: selectedPool.volume24hUsd,
              tokenSide: selectedPool.tokenSide,
            },
            token: {
              address: selectedPool.token.address,
              name: selectedPool.token.name,
              symbol: selectedPool.token.symbol,
            },
            outputPath,
            runtimePath: toRuntimeContractRelativePath(outputPath),
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
          code: retryable ? "GECKOTERMINAL_OHLC_DOWNLOAD_RETRYABLE" : "GECKOTERMINAL_OHLC_DOWNLOAD_FAILED",
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }
    },
  };
};

export const downloadGeckoTerminalOhlcvAction = createDownloadGeckoTerminalOhlcvAction();
