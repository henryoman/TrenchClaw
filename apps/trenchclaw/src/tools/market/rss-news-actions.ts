import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { Action } from "../../ai/contracts/types/action";
import {
  isNormalizedNewsFeedRetryableError,
  readNormalizedNewsFeed,
  type NormalizedNewsFeedResult,
} from "./rss";
import { ensureInstanceLayout } from "../../runtime/instance/layout";
import { resolveRequiredActiveInstanceIdSync } from "../../runtime/instance/state";
import { resolveConfiguredNewsFeedByAlias } from "../../runtime/instance/registries/news-feeds";
import { resolveInstanceWorkspaceNewsRoot } from "../../runtime/instance/workspace";
import { toRuntimeContractRelativePath } from "../../runtime/runtime-paths";

export const DEFAULT_SOLANA_NEWS_FEED_URL = "https://cryptopotato.com/tag/solana/feed/";

const getLatestSolanaNewsInputSchema = z.object({
  feedAlias: z.string().trim().min(1).optional(),
  feedUrl: z.url().optional(),
  limit: z.number().int().positive().max(25).default(5),
  excerptMaxChars: z.number().int().positive().max(600).default(280),
  includeFullContent: z.boolean().default(false),
  contentMaxChars: z.number().int().positive().max(4_000).default(1_200),
}).superRefine((input, ctx) => {
  if (input.feedAlias && input.feedUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["feedAlias"],
      message: "Pass either `feedAlias` or `feedUrl`, not both.",
    });
  }
});

type GetLatestSolanaNewsInput = z.input<typeof getLatestSolanaNewsInputSchema>;

interface GetLatestSolanaNewsOutput extends NormalizedNewsFeedResult {
  instanceId: string;
  outputPath: string;
  runtimePath: string;
  feedAlias?: string | null;
  feedRegistryRuntimePath?: string | null;
}

const sanitizePathSegment = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80) || "segment";

const createNewsArtifactFileName = (feedUrl: string, fetchedAtIso: string): string => {
  const url = new URL(feedUrl);
  const hostSegment = sanitizePathSegment(url.hostname);
  const pathSegment = sanitizePathSegment(url.pathname.replace(/\/feed\/?$/u, "") || "feed");
  const timestampSegment = fetchedAtIso.replace(/[:.]/gu, "-");
  return `${hostSegment}-${pathSegment}-${timestampSegment}.json`;
};

export const getLatestSolanaNewsAction: Action<GetLatestSolanaNewsInput, GetLatestSolanaNewsOutput> = {
  name: "getLatestSolanaNews",
  category: "data-based",
  inputSchema: getLatestSolanaNewsInputSchema,
  async execute(_ctx, rawInput) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const input = getLatestSolanaNewsInputSchema.parse(rawInput);
      const activeInstanceId = resolveRequiredActiveInstanceIdSync(
        "No active instance selected. News downloads are instance-scoped.",
      );
      await ensureInstanceLayout(activeInstanceId);

      const configuredFeed = input.feedAlias
        ? await resolveConfiguredNewsFeedByAlias(activeInstanceId, input.feedAlias)
        : null;
      const data = await readNormalizedNewsFeed({
        ...input,
        feedUrl: configuredFeed?.feed.feedUrl ?? input.feedUrl ?? DEFAULT_SOLANA_NEWS_FEED_URL,
      });
      const outputDirectory = resolveInstanceWorkspaceNewsRoot(activeInstanceId);
      const outputPath = path.join(outputDirectory, createNewsArtifactFileName(data.feed.feedUrl, data.fetchedAt));
      const artifactDocument = {
        fetchedAt: data.fetchedAt,
        artifactType: "news-feed-download",
        source: "rss-news",
        instanceId: activeInstanceId,
        feedAlias: configuredFeed?.feed.alias ?? null,
        feedRegistryRuntimePath: configuredFeed?.runtimePath ?? null,
        request: data.request,
        feed: data.feed,
        totalArticleCount: data.totalArticleCount,
        returnedArticleCount: data.returnedArticleCount,
        hasMore: data.hasMore,
        articles: data.articles,
      };

      await mkdir(outputDirectory, { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(artifactDocument, null, 2)}\n`, "utf8");

      return {
        ok: true,
        retryable: false,
        data: {
          ...data,
          instanceId: activeInstanceId,
          outputPath,
          runtimePath: toRuntimeContractRelativePath(outputPath),
          feedAlias: configuredFeed?.feed.alias ?? null,
          feedRegistryRuntimePath: configuredFeed?.runtimePath ?? null,
        },
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    } catch (error) {
      const retryable = isNormalizedNewsFeedRetryableError(error);
      return {
        ok: false,
        retryable,
        error: error instanceof Error ? error.message : String(error),
        code: retryable ? "RSS_NEWS_ACTION_RETRYABLE" : "RSS_NEWS_ACTION_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
