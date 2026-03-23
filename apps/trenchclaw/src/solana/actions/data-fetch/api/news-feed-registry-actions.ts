import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import { ensureInstanceLayout } from "../../../../runtime/instance-layout";
import { resolveRequiredActiveInstanceIdSync } from "../../../../runtime/instance-state";
import { readInstanceNewsFeedRegistry } from "../../../../runtime/news-feed-registry";

const nonEmptyStringSchema = z.string().trim().min(1);

const getConfiguredNewsFeedsInputSchema = z.object({
  query: nonEmptyStringSchema.optional(),
  tags: z.array(nonEmptyStringSchema).max(20).optional(),
  enabledOnly: z.boolean().default(true),
  limit: z.number().int().positive().max(100).default(50),
});

type GetConfiguredNewsFeedsInput = z.input<typeof getConfiguredNewsFeedsInputSchema>;

interface GetConfiguredNewsFeedsOutput {
  instanceId: string;
  filePath: string;
  runtimePath: string;
  version: number;
  totalFeedCount: number;
  returnedFeedCount: number;
  feeds: Array<{
    alias: string;
    title: string;
    feedUrl: string;
    description?: string;
    tags: string[];
    enabled: boolean;
  }>;
}

const matchesQuery = (value: {
  alias: string;
  title: string;
  description?: string;
  tags: string[];
}, query: string | undefined): boolean => {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [
    value.alias,
    value.title,
    value.description ?? "",
    value.tags.join(" "),
  ].some((field) => field.toLowerCase().includes(normalizedQuery));
};

const matchesTags = (feedTags: readonly string[], requestedTags: readonly string[] | undefined): boolean => {
  if (!requestedTags || requestedTags.length === 0) {
    return true;
  }

  const normalizedFeedTags = new Set(feedTags.map((tag) => tag.toLowerCase()));
  return requestedTags.every((tag) => normalizedFeedTags.has(tag.toLowerCase()));
};

export const getConfiguredNewsFeedsAction: Action<GetConfiguredNewsFeedsInput, GetConfiguredNewsFeedsOutput> = {
  name: "getConfiguredNewsFeeds",
  category: "data-based",
  inputSchema: getConfiguredNewsFeedsInputSchema,
  async execute(_ctx, rawInput) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const input = getConfiguredNewsFeedsInputSchema.parse(rawInput);
      const activeInstanceId = resolveRequiredActiveInstanceIdSync(
        "No active instance selected. Configured news feeds are instance-scoped.",
      );
      await ensureInstanceLayout(activeInstanceId);

      const registryState = await readInstanceNewsFeedRegistry(activeInstanceId);
      const filteredFeeds = registryState.registry.feeds
        .filter((feed) => !input.enabledOnly || feed.enabled)
        .filter((feed) => matchesQuery(feed, input.query))
        .filter((feed) => matchesTags(feed.tags, input.tags))
        .slice(0, input.limit)
        .map((feed) => ({
          alias: feed.alias,
          title: feed.title,
          feedUrl: feed.feedUrl,
          description: feed.description,
          tags: [...feed.tags],
          enabled: feed.enabled,
        }));

      return {
        ok: true,
        retryable: false,
        data: {
          instanceId: activeInstanceId,
          filePath: registryState.filePath,
          runtimePath: registryState.runtimePath,
          version: registryState.registry.version,
          totalFeedCount: registryState.registry.feeds.length,
          returnedFeedCount: filteredFeeds.length,
          feeds: filteredFeeds,
        },
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    } catch (error) {
      return {
        ok: false,
        retryable: false,
        error: error instanceof Error ? error.message : String(error),
        code: "CONFIGURED_NEWS_FEEDS_ACTION_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
