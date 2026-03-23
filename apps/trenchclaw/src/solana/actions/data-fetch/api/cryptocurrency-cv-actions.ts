import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import { ensureInstanceLayout } from "../../../../runtime/instance-layout";
import { resolveRequiredActiveInstanceIdSync } from "../../../../runtime/instance-state";
import { resolveInstanceWorkspaceNewsRoot } from "../../../../runtime/instance-workspace";
import { toRuntimeContractRelativePath } from "../../../../runtime/runtime-paths";
import {
  getCryptoAssetSentiment,
  getCryptoFearGreedIndex,
  getCryptoNewsLatest,
  getCryptoTrendingTopics,
  isCryptocurrencyCvRetryableError,
  searchCryptoNews,
} from "./cryptocurrency-cv";

const nonEmptyStringSchema = z.string().trim().min(1);
const positiveIntSchema = z.number().int().positive();

const latestCryptoNewsInputSchema = z.object({
  page: positiveIntSchema.default(1),
  perPage: positiveIntSchema.max(100).default(10),
  lang: nonEmptyStringSchema.optional(),
  category: nonEmptyStringSchema.optional(),
});

const searchCryptoNewsInputSchema = z.object({
  query: nonEmptyStringSchema,
  page: positiveIntSchema.default(1),
  perPage: positiveIntSchema.max(100).default(10),
  lang: nonEmptyStringSchema.optional(),
});

const cryptoAssetSentimentInputSchema = z.object({
  asset: nonEmptyStringSchema,
});

const emptyInputSchema = z.object({});

interface CryptoNewsApiActionOutput {
  source: "cryptocurrency.cv";
  endpoint: string;
  requestUrl: string;
  requestParams: Record<string, string | number | boolean>;
  fetchedAt: string;
  summary: Record<string, string | number | boolean>;
  payload: unknown;
  instanceId: string;
  outputPath: string;
  runtimePath: string;
}

const sanitizePathSegment = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80) || "segment";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const createArtifactFileName = (endpoint: string, requestParams: Record<string, string | number | boolean>, fetchedAtIso: string): string => {
  const endpointSegment = sanitizePathSegment(endpoint.replace(/^\/+|\/+$/gu, "").replace(/\//gu, "-"));
  const requestSegment = sanitizePathSegment(
    Object.entries(requestParams)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}-${value}`)
      .join("-"),
  );
  const timestampSegment = fetchedAtIso.replace(/[:.]/gu, "-");
  return `${endpointSegment}${requestSegment === "segment" ? "" : `-${requestSegment}`}-${timestampSegment}.json`;
};

const summarizePayload = (payload: unknown): Record<string, string | number | boolean> => {
  const summary: Record<string, string | number | boolean> = {};

  if (!isRecord(payload)) {
    return summary;
  }

  if (Array.isArray(payload.articles)) {
    summary.articleCount = payload.articles.length;
  }
  if (Array.isArray(payload.trending)) {
    summary.topicCount = payload.trending.length;
  }
  if (typeof payload.totalCount === "number") {
    summary.totalCount = payload.totalCount;
  }
  if (typeof payload.search_type === "string") {
    summary.searchType = payload.search_type;
  }
  if (typeof payload.timeWindow === "string") {
    summary.timeWindow = payload.timeWindow;
  }
  if (typeof payload.articlesAnalyzed === "number") {
    summary.articlesAnalyzed = payload.articlesAnalyzed;
  }
  if (typeof payload.lang === "string") {
    summary.lang = payload.lang;
  }

  const pagination = isRecord(payload.pagination) ? payload.pagination : null;
  if (pagination) {
    if (typeof pagination.page === "number") {
      summary.page = pagination.page;
    }
    if (typeof pagination.perPage === "number") {
      summary.perPage = pagination.perPage;
    }
    if (typeof pagination.totalPages === "number") {
      summary.totalPages = pagination.totalPages;
    }
    if (typeof pagination.hasMore === "boolean") {
      summary.hasMore = pagination.hasMore;
    }
  }

  return summary;
};

const resolveFetchedAt = (payload: unknown): string =>
  isRecord(payload) && typeof payload.fetchedAt === "string" && payload.fetchedAt.trim()
    ? payload.fetchedAt
    : new Date().toISOString();

const persistNewsArtifact = async (input: {
  endpoint: string;
  requestUrl: string;
  requestParams: Record<string, string | number | boolean>;
  payload: unknown;
}): Promise<{
  instanceId: string;
  outputPath: string;
  runtimePath: string;
  fetchedAt: string;
  summary: Record<string, string | number | boolean>;
}> => {
  const activeInstanceId = resolveRequiredActiveInstanceIdSync(
    "No active instance selected. Crypto news downloads are instance-scoped.",
  );
  await ensureInstanceLayout(activeInstanceId);

  const fetchedAt = resolveFetchedAt(input.payload);
  const summary = summarizePayload(input.payload);
  const outputDirectory = resolveInstanceWorkspaceNewsRoot(activeInstanceId);
  const outputPath = path.join(outputDirectory, createArtifactFileName(input.endpoint, input.requestParams, fetchedAt));
  const artifactDocument = {
    fetchedAt,
    artifactType: "crypto-news-api-download",
    source: "cryptocurrency.cv",
    endpoint: input.endpoint,
    requestUrl: input.requestUrl,
    requestParams: input.requestParams,
    summary,
    payload: input.payload,
    instanceId: activeInstanceId,
  };

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifactDocument, null, 2)}\n`, "utf8");

  return {
    instanceId: activeInstanceId,
    outputPath,
    runtimePath: toRuntimeContractRelativePath(outputPath),
    fetchedAt,
    summary,
  };
};

const createCryptoNewsAction = <TInput>(input: {
  name: string;
  endpoint: string;
  inputSchema: z.ZodType<TInput>;
  buildRequestParams: (parsed: TInput) => Record<string, string | number | boolean>;
  execute: (parsed: TInput) => Promise<{
    requestUrl: string;
    payload: unknown;
  }>;
}): Action<TInput, CryptoNewsApiActionOutput> => ({
  name: input.name,
  category: "data-based",
  inputSchema: input.inputSchema,
  async execute(_ctx, rawInput) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const parsed = input.inputSchema.parse(rawInput);
      const result = await input.execute(parsed);
      const requestParams = input.buildRequestParams(parsed);
      const persisted = await persistNewsArtifact({
        endpoint: input.endpoint,
        requestUrl: result.requestUrl,
        requestParams,
        payload: result.payload,
      });

      return {
        ok: true,
        retryable: false,
        data: {
          source: "cryptocurrency.cv",
          endpoint: input.endpoint,
          requestUrl: result.requestUrl,
          requestParams,
          fetchedAt: persisted.fetchedAt,
          summary: persisted.summary,
          payload: result.payload,
          instanceId: persisted.instanceId,
          outputPath: persisted.outputPath,
          runtimePath: persisted.runtimePath,
        },
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    } catch (error) {
      const retryable = isCryptocurrencyCvRetryableError(error);
      return {
        ok: false,
        retryable,
        error: error instanceof Error ? error.message : String(error),
        code: retryable ? "CRYPTO_NEWS_API_ACTION_RETRYABLE" : "CRYPTO_NEWS_API_ACTION_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
});

export const getCryptoNewsLatestAction = createCryptoNewsAction({
  name: "getCryptoNewsLatest",
  endpoint: "/api/news",
  inputSchema: latestCryptoNewsInputSchema,
  buildRequestParams: (input) => ({
    page: input.page,
    perPage: input.perPage,
    ...(input.lang ? { lang: input.lang } : {}),
    ...(input.category ? { category: input.category } : {}),
  }),
  execute: async (input) => getCryptoNewsLatest(input),
});

export const searchCryptoNewsAction = createCryptoNewsAction({
  name: "searchCryptoNews",
  endpoint: "/api/search",
  inputSchema: searchCryptoNewsInputSchema,
  buildRequestParams: (input) => ({
    q: input.query,
    page: input.page,
    perPage: input.perPage,
    ...(input.lang ? { lang: input.lang } : {}),
  }),
  execute: async (input) => searchCryptoNews(input),
});

export const getCryptoAssetSentimentAction = createCryptoNewsAction({
  name: "getCryptoAssetSentiment",
  endpoint: "/api/ai/sentiment",
  inputSchema: cryptoAssetSentimentInputSchema,
  buildRequestParams: (input) => ({
    asset: input.asset,
  }),
  execute: async (input) => getCryptoAssetSentiment(input),
});

export const getCryptoFearGreedIndexAction = createCryptoNewsAction({
  name: "getCryptoFearGreedIndex",
  endpoint: "/api/market/fear-greed",
  inputSchema: emptyInputSchema,
  buildRequestParams: () => ({}),
  execute: async () => getCryptoFearGreedIndex(),
});

export const getCryptoTrendingTopicsAction = createCryptoNewsAction({
  name: "getCryptoTrendingTopics",
  endpoint: "/api/trending",
  inputSchema: emptyInputSchema,
  buildRequestParams: () => ({}),
  execute: async () => getCryptoTrendingTopics(),
});
