import path from "node:path";

import { address, createSolanaRpc } from "@solana/kit";
import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import {
  DEFAULT_WALLET_LIBRARY_FILE_NAME,
  walletGroupNameSchema,
  walletNameSchema,
  type ManagedWalletLibraryEntry,
} from "../../../lib/wallet/wallet-types";
import {
  inferManagedWalletLibraryEntriesFromFilesystem,
  readManagedWalletLibraryEntries,
  resolveWalletKeypairRootPathForInstanceId,
} from "../../../lib/wallet/wallet-manager";
import { resolveRequiredRpcUrl } from "../../../lib/rpc/urls";
import { resolveInstanceId } from "./instance-memory-shared";

const maxWalletNames = 100;
const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const getManagedWalletContentsInputSchema = z.object({
  instanceId: z.string().trim().min(1).max(64).optional(),
  walletGroup: walletGroupNameSchema.optional(),
  walletNames: z.array(walletNameSchema).max(maxWalletNames).optional(),
  includeZeroBalances: z.boolean().default(false),
});

type GetManagedWalletContentsInput = z.output<typeof getManagedWalletContentsInputSchema>;

type TokenProgramLabel = "spl-token" | "token-2022";

export interface ManagedWalletTokenBalance {
  mintAddress: string;
  tokenProgram: TokenProgramLabel;
  programId: string;
  balanceRaw: string;
  balance: number;
  balanceUiString: string;
  decimals: number;
  tokenAccountAddresses: string[];
}

interface LoadWalletContentsResult {
  lamports: bigint;
  tokenBalances: ManagedWalletTokenBalance[];
}

interface GetManagedWalletContentsDeps {
  loadWalletContents?: (input: {
    rpcUrl?: string;
    address: string;
    includeZeroBalances: boolean;
  }) => Promise<LoadWalletContentsResult>;
}

interface ParsedTokenAccountBalance {
  mintAddress: string;
  tokenProgram: TokenProgramLabel;
  programId: string;
  amountRaw: bigint;
  balanceUiString: string;
  decimals: number;
  tokenAccountAddress: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const toUiAmount = (balanceUiString: string): number => {
  const parsed = Number(balanceUiString);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toUiStringFromRaw = (amountRaw: bigint, decimals: number): string => {
  if (decimals <= 0) {
    return amountRaw.toString();
  }

  const negative = amountRaw < 0n;
  const absolute = negative ? -amountRaw : amountRaw;
  const padded = absolute.toString().padStart(decimals + 1, "0");
  const integerPart = padded.slice(0, -decimals) || "0";
  const fractionPart = padded.slice(-decimals).replace(/0+$/u, "");
  const prefix = negative ? "-" : "";
  return fractionPart.length > 0 ? `${prefix}${integerPart}.${fractionPart}` : `${prefix}${integerPart}`;
};

const parseTokenAccountBalance = (
  entry: unknown,
  defaults: { tokenProgram: TokenProgramLabel; programId: string },
): ParsedTokenAccountBalance | null => {
  if (!isRecord(entry)) {
    return null;
  }

  const tokenAccountAddress = typeof entry.pubkey === "string" ? entry.pubkey : null;
  const account = isRecord(entry.account) ? entry.account : null;
  const accountProgramId = account && typeof account.owner === "string" ? account.owner : defaults.programId;
  const data = account && isRecord(account.data) ? account.data : null;
  const parsed = data && isRecord(data.parsed) ? data.parsed : null;
  const info = parsed && isRecord(parsed.info) ? parsed.info : null;
  const tokenAmount = info && isRecord(info.tokenAmount) ? info.tokenAmount : null;
  const mintAddress = info && typeof info.mint === "string" ? info.mint : null;
  const amountRawString = tokenAmount && typeof tokenAmount.amount === "string" ? tokenAmount.amount : null;
  const decimals = tokenAmount && typeof tokenAmount.decimals === "number" ? tokenAmount.decimals : 0;
  const uiAmountString =
    tokenAmount && typeof tokenAmount.uiAmountString === "string"
      ? tokenAmount.uiAmountString
      : amountRawString
        ? toUiStringFromRaw(BigInt(amountRawString), decimals)
        : "0";

  if (!tokenAccountAddress || !mintAddress || !amountRawString) {
    return null;
  }

  return {
    mintAddress,
    tokenProgram: defaults.tokenProgram,
    programId: accountProgramId,
    amountRaw: BigInt(amountRawString),
    balanceUiString: uiAmountString,
    decimals,
    tokenAccountAddress,
  };
};

const aggregateTokenBalances = (
  balances: ParsedTokenAccountBalance[],
  includeZeroBalances: boolean,
): ManagedWalletTokenBalance[] => {
  const grouped = new Map<string, {
    mintAddress: string;
    tokenProgram: TokenProgramLabel;
    programId: string;
    amountRaw: bigint;
    decimals: number;
    tokenAccountAddresses: string[];
  }>();

  for (const balance of balances) {
    if (!includeZeroBalances && balance.amountRaw === 0n) {
      continue;
    }

    const key = `${balance.programId}:${balance.mintAddress}:${balance.decimals}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.amountRaw += balance.amountRaw;
      existing.tokenAccountAddresses.push(balance.tokenAccountAddress);
      continue;
    }

    grouped.set(key, {
      mintAddress: balance.mintAddress,
      tokenProgram: balance.tokenProgram,
      programId: balance.programId,
      amountRaw: balance.amountRaw,
      decimals: balance.decimals,
      tokenAccountAddresses: [balance.tokenAccountAddress],
    });
  }

  return Array.from(grouped.values())
    .map((entry) => {
      const balanceUiString = toUiStringFromRaw(entry.amountRaw, entry.decimals);
      return {
        mintAddress: entry.mintAddress,
        tokenProgram: entry.tokenProgram,
        programId: entry.programId,
        balanceRaw: entry.amountRaw.toString(),
        balance: toUiAmount(balanceUiString),
        balanceUiString,
        decimals: entry.decimals,
        tokenAccountAddresses: [...new Set(entry.tokenAccountAddresses)].toSorted((left, right) => left.localeCompare(right)),
      };
    })
    .toSorted((left, right) => {
      const byProgram = left.tokenProgram.localeCompare(right.tokenProgram);
      if (byProgram !== 0) {
        return byProgram;
      }
      return left.mintAddress.localeCompare(right.mintAddress);
    });
};

const loadWalletContentsFromRpc = async (input: {
  rpcUrl?: string;
  address: string;
  includeZeroBalances: boolean;
}): Promise<LoadWalletContentsResult> => {
  const rpc = createSolanaRpc(resolveRequiredRpcUrl(input.rpcUrl));
  const ownerAddress = address(input.address);
  const [solBalance, splTokenAccounts, token2022Accounts] = await Promise.all([
    rpc.getBalance(ownerAddress).send(),
    (rpc as any)
      .getTokenAccountsByOwner(
        ownerAddress,
        {
          programId: address(TOKEN_PROGRAM_ID),
        },
        {
          encoding: "jsonParsed",
        },
      )
      .send(),
    (rpc as any)
      .getTokenAccountsByOwner(
        ownerAddress,
        {
          programId: address(TOKEN_2022_PROGRAM_ID),
        },
        {
          encoding: "jsonParsed",
        },
      )
      .send(),
  ]);

  const parsedTokenBalances = [
    ...(Array.isArray(splTokenAccounts?.value) ? splTokenAccounts.value : []).map((entry: unknown) =>
      parseTokenAccountBalance(entry, { tokenProgram: "spl-token", programId: TOKEN_PROGRAM_ID })),
    ...(Array.isArray(token2022Accounts?.value) ? token2022Accounts.value : []).map((entry: unknown) =>
      parseTokenAccountBalance(entry, { tokenProgram: "token-2022", programId: TOKEN_2022_PROGRAM_ID })),
  ].filter((entry): entry is ParsedTokenAccountBalance => entry !== null);

  return {
    lamports: solBalance.value,
    tokenBalances: aggregateTokenBalances(parsedTokenBalances, input.includeZeroBalances),
  };
};

const filterWalletEntries = (
  entries: ManagedWalletLibraryEntry[],
  input: GetManagedWalletContentsInput,
): ManagedWalletLibraryEntry[] => {
  const requestedNames = input.walletNames ? new Set(input.walletNames) : null;
  return entries
    .filter((entry) => {
      if (input.walletGroup && entry.walletGroup !== input.walletGroup) {
        return false;
      }
      if (requestedNames && !requestedNames.has(entry.walletName)) {
        return false;
      }
      return true;
    })
    .toSorted((left, right) =>
      `${left.walletGroup}.${left.walletName}`.localeCompare(`${right.walletGroup}.${right.walletName}`));
};

export const createGetManagedWalletContentsAction = (
  deps: GetManagedWalletContentsDeps = {},
): Action<GetManagedWalletContentsInput, unknown> => {
  const loadWalletContents = deps.loadWalletContents ?? loadWalletContentsFromRpc;

  return {
    name: "getManagedWalletContents",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: getManagedWalletContentsInputSchema,
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

        let discoveredVia: "wallet-library" | "label-files" = "wallet-library";
        let entries = walletLibrary.entries;
        if (entries.length === 0) {
          entries = await inferManagedWalletLibraryEntriesFromFilesystem({ keypairRootPath });
          discoveredVia = "label-files";
        }

        const filteredEntries = filterWalletEntries(entries, input);
        const wallets = await Promise.all(
          filteredEntries.map(async (entry) => {
            const contents = await loadWalletContents({
              rpcUrl: ctx.rpcUrl,
              address: entry.address,
              includeZeroBalances: input.includeZeroBalances,
            });
            return {
              walletId: entry.walletId,
              walletGroup: entry.walletGroup,
              walletName: entry.walletName,
              address: entry.address,
              balanceLamports: contents.lamports.toString(),
              balanceSol: Number(contents.lamports) / LAMPORTS_PER_SOL,
              tokenCount: contents.tokenBalances.length,
              tokenBalances: contents.tokenBalances,
            };
          }),
        );

        const totalBalanceLamports = wallets.reduce((sum, wallet) => sum + BigInt(wallet.balanceLamports), 0n);
        const tokenTotals = new Map<string, {
          mintAddress: string;
          tokenProgram: TokenProgramLabel;
          programId: string;
          decimals: number;
          amountRaw: bigint;
          walletIds: Set<string>;
        }>();

        for (const wallet of wallets) {
          for (const tokenBalance of wallet.tokenBalances) {
            const key = `${tokenBalance.programId}:${tokenBalance.mintAddress}:${tokenBalance.decimals}`;
            const existing = tokenTotals.get(key);
            if (existing) {
              existing.amountRaw += BigInt(tokenBalance.balanceRaw);
              existing.walletIds.add(wallet.walletId);
              continue;
            }

            tokenTotals.set(key, {
              mintAddress: tokenBalance.mintAddress,
              tokenProgram: tokenBalance.tokenProgram,
              programId: tokenBalance.programId,
              decimals: tokenBalance.decimals,
              amountRaw: BigInt(tokenBalance.balanceRaw),
              walletIds: new Set([wallet.walletId]),
            });
          }
        }

        const aggregatedTokenTotals = Array.from(tokenTotals.values())
          .map((entry) => {
            const balanceUiString = toUiStringFromRaw(entry.amountRaw, entry.decimals);
            return {
              mintAddress: entry.mintAddress,
              tokenProgram: entry.tokenProgram,
              programId: entry.programId,
              balanceRaw: entry.amountRaw.toString(),
              balance: toUiAmount(balanceUiString),
              balanceUiString,
              decimals: entry.decimals,
              walletCount: entry.walletIds.size,
            };
          })
          .toSorted((left, right) => {
            const byProgram = left.tokenProgram.localeCompare(right.tokenProgram);
            if (byProgram !== 0) {
              return byProgram;
            }
            return left.mintAddress.localeCompare(right.mintAddress);
          });

        return {
          ok: true,
          retryable: false,
          data: {
            instanceId,
            walletCount: wallets.length,
            discoveredVia,
            walletLibraryFilePath,
            invalidLibraryLineCount: walletLibrary.invalidLineCount,
            includeZeroBalances: input.includeZeroBalances,
            wallets,
            totalBalanceLamports: totalBalanceLamports.toString(),
            totalBalanceSol: Number(totalBalanceLamports) / LAMPORTS_PER_SOL,
            tokenTotals: aggregatedTokenTotals,
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
          code: "GET_MANAGED_WALLET_CONTENTS_FAILED",
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }
    },
  };
};

export const getManagedWalletContentsAction = createGetManagedWalletContentsAction();
