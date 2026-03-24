import { z } from "zod";

import type { Action } from "../../../../ai/contracts/types/action";
import { ensureInstanceLayout } from "../../../../runtime/instance/layout";
import { resolveRequiredActiveInstanceIdSync } from "../../../../runtime/instance/state";
import { readInstanceTrackerRegistry } from "../../../../runtime/instance/registries/tracker";

const nonEmptyStringSchema = z.string().trim().min(1);

const getWalletTrackerInputSchema = z.object({
  query: nonEmptyStringSchema.optional(),
  includeDisabled: z.boolean().default(false),
  limit: z.number().int().positive().max(200).default(100),
});

type GetWalletTrackerInput = z.input<typeof getWalletTrackerInputSchema>;

interface GetWalletTrackerOutput {
  instanceId: string;
  filePath: string;
  runtimePath: string;
  version: number;
  totalTrackedWalletCount: number;
  totalTrackedTokenCount: number;
  returnedWalletCount: number;
  returnedTokenCount: number;
  trackedWallets: Array<{
    address: string;
    label: string;
    notes: string;
    tags: string[];
    enabled: boolean;
  }>;
  trackedTokens: Array<{
    mintAddress: string;
    symbol: string;
    label: string;
    notes: string;
    tags: string[];
    enabled: boolean;
  }>;
}

const matchesQuery = (fields: readonly string[], query: string | undefined): boolean => {
  if (!query) {
    return true;
  }
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return fields.some((field) => field.toLowerCase().includes(normalizedQuery));
};

export const getWalletTrackerAction: Action<GetWalletTrackerInput, GetWalletTrackerOutput> = {
  name: "getWalletTracker",
  category: "data-based",
  inputSchema: getWalletTrackerInputSchema,
  async execute(_ctx, rawInput) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const input = getWalletTrackerInputSchema.parse(rawInput);
      const activeInstanceId = resolveRequiredActiveInstanceIdSync(
        "No active instance selected. Wallet tracker is instance-scoped.",
      );
      await ensureInstanceLayout(activeInstanceId);

      const trackerState = await readInstanceTrackerRegistry(activeInstanceId);
      const trackedWallets = trackerState.registry.trackedWallets
        .filter((wallet) => input.includeDisabled || wallet.enabled)
        .filter((wallet) =>
          matchesQuery(
            [wallet.address, wallet.label, wallet.notes, wallet.tags.join(" ")],
            input.query,
          ))
        .slice(0, input.limit)
        .map((wallet) => ({
          address: wallet.address,
          label: wallet.label,
          notes: wallet.notes,
          tags: [...wallet.tags],
          enabled: wallet.enabled,
        }));

      const trackedTokens = trackerState.registry.trackedTokens
        .filter((token) => input.includeDisabled || token.enabled)
        .filter((token) =>
          matchesQuery(
            [token.mintAddress, token.symbol, token.label, token.notes, token.tags.join(" ")],
            input.query,
          ))
        .slice(0, input.limit)
        .map((token) => ({
          mintAddress: token.mintAddress,
          symbol: token.symbol,
          label: token.label,
          notes: token.notes,
          tags: [...token.tags],
          enabled: token.enabled,
        }));

      return {
        ok: true,
        retryable: false,
        data: {
          instanceId: activeInstanceId,
          filePath: trackerState.filePath,
          runtimePath: trackerState.runtimePath,
          version: trackerState.registry.version,
          totalTrackedWalletCount: trackerState.registry.trackedWallets.length,
          totalTrackedTokenCount: trackerState.registry.trackedTokens.length,
          returnedWalletCount: trackedWallets.length,
          returnedTokenCount: trackedTokens.length,
          trackedWallets,
          trackedTokens,
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
        code: "WALLET_TRACKER_ACTION_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
