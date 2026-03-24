import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { resolveInstanceWorkspaceNewsFeedRegistryPath } from "./instance-workspace";
import { resolveRuntimeSeedInstancePath, toRuntimeContractRelativePath } from "./runtime-paths";

const nonEmptyStringSchema = z.string().trim().min(1);

export const configuredNewsFeedSchema = z.object({
  alias: nonEmptyStringSchema.regex(/^[a-z0-9][a-z0-9-]*$/u),
  title: nonEmptyStringSchema,
  feedUrl: z.url(),
  description: z.string().trim().optional(),
  tags: z.array(nonEmptyStringSchema).default([]),
  enabled: z.boolean().default(true),
});

export const configuredNewsFeedRegistrySchema = z.object({
  version: z.literal(1).default(1),
  feeds: z.array(configuredNewsFeedSchema).default([]),
});

export type ConfiguredNewsFeed = z.output<typeof configuredNewsFeedSchema>;
export type ConfiguredNewsFeedRegistry = z.output<typeof configuredNewsFeedRegistrySchema>;

export const DEFAULT_CONFIGURED_NEWS_FEEDS: readonly ConfiguredNewsFeed[] = [
  {
    alias: "solana-cryptopotato",
    title: "CryptoPotato Solana",
    feedUrl: "https://cryptopotato.com/tag/solana/feed/",
    description: "CryptoPotato Solana tag RSS feed.",
    tags: ["solana", "rss", "news"],
    enabled: true,
  },
] as const;

const createDefaultConfiguredNewsFeedRegistry = (): ConfiguredNewsFeedRegistry => ({
  version: 1,
  feeds: DEFAULT_CONFIGURED_NEWS_FEEDS.map((feed) =>
    Object.assign({}, feed, {
      tags: [...feed.tags],
    })),
});

const parseConfiguredNewsFeedRegistry = (payload: unknown, filePath: string): ConfiguredNewsFeedRegistry => {
  const parsed = configuredNewsFeedRegistrySchema.parse(payload);
  const aliasMap = new Map<string, ConfiguredNewsFeed>();

  for (const feed of parsed.feeds) {
    if (aliasMap.has(feed.alias)) {
      throw new Error(`Configured news feed registry at "${filePath}" contains duplicate alias "${feed.alias}".`);
    }
    aliasMap.set(feed.alias, feed);
  }

  return {
    version: parsed.version,
    feeds: parsed.feeds.toSorted((left, right) => left.alias.localeCompare(right.alias)),
  };
};

export const ensureInstanceNewsFeedRegistryExists = async (instanceId: string): Promise<{
  filePath: string;
  runtimePath: string;
  initialized: boolean;
}> => {
  const filePath = resolveInstanceWorkspaceNewsFeedRegistryPath(instanceId);
  const file = Bun.file(filePath);
  if (await file.exists()) {
    return {
      filePath,
      runtimePath: toRuntimeContractRelativePath(filePath),
      initialized: false,
    };
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  const seedPath = resolveRuntimeSeedInstancePath("workspace", "configs", "news-feeds.json");
  if (!(await Bun.file(seedPath).exists())) {
    throw new Error(`Runtime seed is missing news feed registry file: "${seedPath}"`);
  }
  await copyFile(seedPath, filePath);

  return {
    filePath,
    runtimePath: toRuntimeContractRelativePath(filePath),
    initialized: true,
  };
};

export const readInstanceNewsFeedRegistry = async (instanceId: string): Promise<{
  filePath: string;
  runtimePath: string;
  registry: ConfiguredNewsFeedRegistry;
}> => {
  const ensured = await ensureInstanceNewsFeedRegistryExists(instanceId);
  const payload = await Bun.file(ensured.filePath).json();

  return {
    filePath: ensured.filePath,
    runtimePath: ensured.runtimePath,
    registry: parseConfiguredNewsFeedRegistry(payload, ensured.filePath),
  };
};

export const resolveConfiguredNewsFeedByAlias = async (instanceId: string, alias: string): Promise<{
  filePath: string;
  runtimePath: string;
  feed: ConfiguredNewsFeed;
}> => {
  const normalizedAlias = alias.trim().toLowerCase();
  if (!normalizedAlias) {
    throw new Error('Configured news feed alias must not be empty.');
  }

  const registryState = await readInstanceNewsFeedRegistry(instanceId);
  const feed = registryState.registry.feeds.find((entry) => entry.alias === normalizedAlias);
  if (!feed) {
    throw new Error(
      `Configured news feed alias "${normalizedAlias}" was not found in ${registryState.runtimePath}.`,
    );
  }

  return {
    filePath: registryState.filePath,
    runtimePath: registryState.runtimePath,
    feed,
  };
};
