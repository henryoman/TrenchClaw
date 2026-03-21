import path from "node:path";
import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import {
  managedWalletSelectorListSchema,
  managedWalletSelectorSchema,
  resolveManagedWalletEntriesBySelection,
} from "../../../lib/wallet/wallet-selector";
import {
  DEFAULT_WALLET_LIBRARY_FILE_NAME,
  walletGroupNameSchema,
  walletNameSchema,
  type ManagedWalletLibraryEntry,
} from "../../../lib/wallet/wallet-types";
import {
  readManagedWalletLibraryEntries,
  resolveWalletKeypairRootPathForInstanceId,
} from "../../../lib/wallet/wallet-manager";
import { getBalance } from "../rpc/getBalance";
import { resolveInstanceId } from "./instance-memory-shared";

const maxWalletNames = 100;

const getManagedWalletSolBalancesInputSchema = z.object({
  instanceId: z.string().trim().min(1).max(64).optional(),
  wallet: managedWalletSelectorSchema.optional(),
  wallets: managedWalletSelectorListSchema.optional(),
  walletGroup: walletGroupNameSchema.optional(),
  walletNames: z.array(walletNameSchema).max(maxWalletNames).optional(),
});

type GetManagedWalletSolBalancesInput = z.output<typeof getManagedWalletSolBalancesInputSchema>;

interface LoadBalanceResult {
  lamports: bigint;
}

interface GetManagedWalletSolBalancesDeps {
  loadBalance?: (input: { rpcUrl?: string; address: string }) => Promise<LoadBalanceResult>;
}

const LAMPORTS_PER_SOL = 1_000_000_000;

const filterWalletEntries = (
  entries: ManagedWalletLibraryEntry[],
  input: GetManagedWalletSolBalancesInput,
): ManagedWalletLibraryEntry[] => {
  const requestedNames = input.walletNames && input.walletNames.length > 0 ? new Set(input.walletNames) : null;
  return entries.filter((entry) => {
    if (input.walletGroup && entry.walletGroup !== input.walletGroup) {
      return false;
    }
    if (requestedNames && !requestedNames.has(entry.walletName)) {
      return false;
    }
    return true;
  });
};

const resolveWalletEntries = async (
  entries: ManagedWalletLibraryEntry[],
  input: GetManagedWalletSolBalancesInput,
): Promise<ManagedWalletLibraryEntry[]> => {
  const filteredEntries = filterWalletEntries(entries, input);
  const hasLegacyFilters = Boolean(input.walletGroup) || Boolean(input.walletNames?.length);

  try {
    const selectedEntries = await resolveManagedWalletEntriesBySelection(input);
    if (!selectedEntries) {
      return filteredEntries;
    }

    const selectedWalletIds = new Set(selectedEntries.map((entry) => entry.walletId));
    const narrowedEntries = entries.filter((entry) => selectedWalletIds.has(entry.walletId));
    if (!hasLegacyFilters) {
      return narrowedEntries;
    }

    const filteredWalletIds = new Set(filteredEntries.map((entry) => entry.walletId));
    return narrowedEntries.filter((entry) => filteredWalletIds.has(entry.walletId));
  } catch (error) {
    if (
      hasLegacyFilters
      && error instanceof Error
      && /Managed wallet not found:/u.test(error.message)
    ) {
      return filteredEntries;
    }

    throw error;
  }
};

export const createGetManagedWalletSolBalancesAction = (
  deps: GetManagedWalletSolBalancesDeps = {},
): Action<GetManagedWalletSolBalancesInput, unknown> => {
  const loadBalance = deps.loadBalance ?? (async (input: { rpcUrl?: string; address: string }) =>
    getBalance({
      rpcUrl: input.rpcUrl,
      account: input.address,
    }));

  return {
    name: "getManagedWalletSolBalances",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: getManagedWalletSolBalancesInputSchema,
    async execute(ctx, input) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();
      const instanceId = resolveInstanceId(input.instanceId);

      if (!instanceId) {
        return {
          ok: false,
          retryable: false,
          error: "instanceId is required (input.instanceId or TRENCHCLAW_ACTIVE_INSTANCE_ID)",
          code: "INSTANCE_ID_REQUIRED",
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }

      try {
        const keypairRootPath = resolveWalletKeypairRootPathForInstanceId(instanceId);
        const walletLibraryFilePath = path.join(keypairRootPath, DEFAULT_WALLET_LIBRARY_FILE_NAME);
        const walletLibrary = await readManagedWalletLibraryEntries({
          filePath: walletLibraryFilePath,
          allowMissing: true,
        });

        const discoveredVia = "wallet-library";
        const entries = walletLibrary.entries;

        const filteredEntries = await resolveWalletEntries(entries, input);
        const wallets = await Promise.all(
          filteredEntries.map(async (entry) => {
            const balance = await loadBalance({
              rpcUrl: ctx.rpcUrl,
              address: entry.address,
            });
            const balanceLamports = balance.lamports;
            return {
              walletId: entry.walletId,
              walletGroup: entry.walletGroup,
              walletName: entry.walletName,
              address: entry.address,
              balanceLamports: balanceLamports.toString(),
              balanceSol: Number(balanceLamports) / LAMPORTS_PER_SOL,
            };
          }),
        );

        const totalBalanceLamports = wallets.reduce((sum, wallet) => sum + BigInt(wallet.balanceLamports), 0n);

        return {
          ok: true,
          retryable: false,
          data: {
            instanceId,
            walletCount: wallets.length,
            discoveredVia,
            walletLibraryFilePath,
            invalidLibraryLineCount: walletLibrary.invalidLineCount,
            wallets,
            totalBalanceLamports: totalBalanceLamports.toString(),
            totalBalanceSol: Number(totalBalanceLamports) / LAMPORTS_PER_SOL,
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
          code: "GET_MANAGED_WALLET_SOL_BALANCES_FAILED",
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }
    },
  };
};

export const getManagedWalletSolBalancesAction = createGetManagedWalletSolBalancesAction();
