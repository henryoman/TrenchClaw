import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { base58AddressSchema } from "../solana/lib/wallet/wallet-types";
import { resolveInstanceWorkspaceTrackerPath } from "./instance-workspace";
import { resolveRuntimeSeedInstancePath, toRuntimeContractRelativePath } from "./runtime-paths";

const shortTextSchema = z.string().trim().max(160).default("");
const nonEmptyStringSchema = z.string().trim().min(1);

const normalizeTags = (tags: readonly string[]): string[] =>
  Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  ).toSorted((left, right) => left.localeCompare(right));

export const trackedWalletSchema = z.object({
  address: base58AddressSchema,
  label: shortTextSchema,
  notes: z.string().trim().default(""),
  tags: z.array(nonEmptyStringSchema).max(50).default([]),
  enabled: z.boolean().default(true),
});

export const trackedTokenSchema = z.object({
  mintAddress: base58AddressSchema,
  symbol: z.string().trim().max(24).default(""),
  label: shortTextSchema,
  notes: z.string().trim().default(""),
  tags: z.array(nonEmptyStringSchema).max(50).default([]),
  enabled: z.boolean().default(true),
});

export const trackerRegistrySchema = z.object({
  version: z.literal(1).default(1),
  trackedWallets: z.array(trackedWalletSchema).default([]),
  trackedTokens: z.array(trackedTokenSchema).default([]),
});

export type TrackedWallet = z.output<typeof trackedWalletSchema>;
export type TrackedToken = z.output<typeof trackedTokenSchema>;
export type TrackerRegistry = z.output<typeof trackerRegistrySchema>;

export const DEFAULT_TRACKER_REGISTRY: Readonly<TrackerRegistry> = Object.freeze({
  version: 1,
  trackedWallets: [],
  trackedTokens: [],
});

const cloneTrackedWallet = (wallet: TrackedWallet): TrackedWallet => ({
  ...wallet,
  tags: [...wallet.tags],
});

const cloneTrackedToken = (token: TrackedToken): TrackedToken => ({
  ...token,
  tags: [...token.tags],
});

const cloneTrackerRegistry = (registry: TrackerRegistry): TrackerRegistry => ({
  version: registry.version,
  trackedWallets: registry.trackedWallets.map(cloneTrackedWallet),
  trackedTokens: registry.trackedTokens.map(cloneTrackedToken),
});

const createDefaultTrackerRegistry = (): TrackerRegistry => cloneTrackerRegistry(DEFAULT_TRACKER_REGISTRY as TrackerRegistry);

const parseTrackerRegistry = (payload: unknown, filePath: string): TrackerRegistry => {
  const parsed = trackerRegistrySchema.parse(payload);
  const walletMap = new Map<string, TrackedWallet>();
  const tokenMap = new Map<string, TrackedToken>();

  for (const wallet of parsed.trackedWallets) {
    const normalizedAddress = wallet.address.trim();
    if (walletMap.has(normalizedAddress)) {
      throw new Error(`Tracker registry at "${filePath}" contains duplicate wallet "${normalizedAddress}".`);
    }
    walletMap.set(normalizedAddress, {
      ...wallet,
      address: normalizedAddress,
      tags: normalizeTags(wallet.tags),
    });
  }

  for (const token of parsed.trackedTokens) {
    const normalizedMint = token.mintAddress.trim();
    if (tokenMap.has(normalizedMint)) {
      throw new Error(`Tracker registry at "${filePath}" contains duplicate token "${normalizedMint}".`);
    }
    tokenMap.set(normalizedMint, {
      ...token,
      mintAddress: normalizedMint,
      tags: normalizeTags(token.tags),
    });
  }

  return {
    version: parsed.version,
    trackedWallets: Array.from(walletMap.values()).toSorted((left, right) => {
      const leftKey = left.label || left.address;
      const rightKey = right.label || right.address;
      return leftKey.localeCompare(rightKey);
    }),
    trackedTokens: Array.from(tokenMap.values()).toSorted((left, right) => {
      const leftKey = left.label || left.symbol || left.mintAddress;
      const rightKey = right.label || right.symbol || right.mintAddress;
      return leftKey.localeCompare(rightKey);
    }),
  };
};

export const ensureInstanceTrackerRegistryExists = async (instanceId: string): Promise<{
  filePath: string;
  runtimePath: string;
  initialized: boolean;
}> => {
  const filePath = resolveInstanceWorkspaceTrackerPath(instanceId);
  const file = Bun.file(filePath);
  if (await file.exists()) {
    return {
      filePath,
      runtimePath: toRuntimeContractRelativePath(filePath),
      initialized: false,
    };
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  const seedPath = resolveRuntimeSeedInstancePath("workspace", "configs", "tracker.json");
  if (!(await Bun.file(seedPath).exists())) {
    throw new Error(`Runtime seed is missing tracker registry file: "${seedPath}"`);
  }
  await copyFile(seedPath, filePath);

  return {
    filePath,
    runtimePath: toRuntimeContractRelativePath(filePath),
    initialized: true,
  };
};

export const readInstanceTrackerRegistry = async (instanceId: string): Promise<{
  filePath: string;
  runtimePath: string;
  registry: TrackerRegistry;
}> => {
  const ensured = await ensureInstanceTrackerRegistryExists(instanceId);
  const payload = await Bun.file(ensured.filePath).json();

  return {
    filePath: ensured.filePath,
    runtimePath: ensured.runtimePath,
    registry: parseTrackerRegistry(payload, ensured.filePath),
  };
};

export const writeInstanceTrackerRegistry = async (
  instanceId: string,
  registryInput: unknown,
): Promise<{
  filePath: string;
  runtimePath: string;
  registry: TrackerRegistry;
}> => {
  const filePath = resolveInstanceWorkspaceTrackerPath(instanceId);
  const registry = parseTrackerRegistry(registryInput, filePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");

  return {
    filePath,
    runtimePath: toRuntimeContractRelativePath(filePath),
    registry,
  };
};
