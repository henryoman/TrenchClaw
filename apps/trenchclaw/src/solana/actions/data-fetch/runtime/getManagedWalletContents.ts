import path from "node:path";

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
const RPC_RETRY_MAX_ATTEMPTS = 4;
const RPC_RETRY_BASE_DELAY_MS = 300;

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

interface JsonRpcBatchRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: unknown[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const sleep = async (delayMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const isRetryableRpcError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b/u.test(message)
    || /rate limit/iu.test(message)
    || /too many requests/iu.test(message)
    || /\b503\b/u.test(message)
    || /\b504\b/u.test(message)
    || /temporarily unavailable/iu.test(message);
};

const withRpcRetries = async <T>(operation: () => Promise<T>): Promise<T> => {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < RPC_RETRY_MAX_ATTEMPTS) {
    try {
      // Retry/backoff must stay sequential so one transient failure does not fan out more RPC load.
      // eslint-disable-next-line no-await-in-loop
      return await operation();
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt >= RPC_RETRY_MAX_ATTEMPTS || !isRetryableRpcError(error)) {
        throw error;
      }
      // Backoff waits must stay sequential between retry attempts.
      // eslint-disable-next-line no-await-in-loop
      await sleep(RPC_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError;
};

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

const formatRpcError = (error: unknown): string => {
  if (!isRecord(error)) {
    return String(error);
  }

  const code = typeof error.code === "number" || typeof error.code === "string" ? String(error.code) : null;
  const message = typeof error.message === "string" ? error.message : "Unknown RPC error";
  return code ? `${code}: ${message}` : message;
};

const getRpcBatchResult = (
  entries: Map<string, unknown>,
  requestId: string,
): unknown => {
  if (!entries.has(requestId)) {
    throw new Error(`RPC batch response did not include result for ${requestId}`);
  }
  return entries.get(requestId);
};

const parseLamports = (result: unknown, requestId: string): bigint => {
  if (!isRecord(result)) {
    throw new Error(`RPC ${requestId} returned an invalid balance payload`);
  }

  const lamports = result.value;
  if (typeof lamports === "bigint") {
    return lamports;
  }
  if (typeof lamports === "number" && Number.isFinite(lamports)) {
    return BigInt(Math.trunc(lamports));
  }
  if (typeof lamports === "string" && lamports.trim().length > 0) {
    return BigInt(lamports);
  }

  throw new Error(`RPC ${requestId} returned a non-numeric balance`);
};

const parseTokenAccountEntries = (result: unknown): unknown[] => {
  if (!isRecord(result)) {
    return [];
  }
  return Array.isArray(result.value) ? result.value : [];
};

const postRpcBatch = async (
  rpcUrl: string,
  requests: JsonRpcBatchRequest[],
): Promise<Map<string, unknown>> => {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(requests),
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `RPC request failed with status ${response.status}${responseText ? `: ${responseText.slice(0, 300)}` : ""}`,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`RPC batch response was not valid JSON: ${message}`, { cause: error });
  }

  if (!Array.isArray(payload)) {
    throw new Error("RPC batch response was not an array");
  }

  const results = new Map<string, unknown>();
  for (const entry of payload) {
    if (!isRecord(entry)) {
      continue;
    }
    const requestId = typeof entry.id === "string" || typeof entry.id === "number" ? String(entry.id) : null;
    if (!requestId) {
      continue;
    }
    if ("error" in entry && entry.error !== undefined) {
      throw new Error(`RPC ${requestId} failed: ${formatRpcError(entry.error)}`);
    }
    if (!("result" in entry)) {
      throw new Error(`RPC ${requestId} returned no result`);
    }
    results.set(requestId, entry.result);
  }

  return results;
};

const loadWalletContentsBatchFromRpc = async (input: {
  rpcUrl?: string;
  entries: ManagedWalletLibraryEntry[];
  includeZeroBalances: boolean;
}): Promise<Array<{
  walletId: string;
  walletGroup: string;
  walletName: string;
  address: string;
  balanceLamports: string;
  balanceSol: number;
  tokenCount: number;
  tokenBalances: ManagedWalletTokenBalance[];
}>> => {
  if (input.entries.length === 0) {
    return [];
  }

  const rpcUrl = resolveRequiredRpcUrl(input.rpcUrl);
  const requests = input.entries.flatMap((entry): JsonRpcBatchRequest[] => [
    {
      jsonrpc: "2.0",
      id: `${entry.address}:balance`,
      method: "getBalance",
      params: [entry.address],
    },
    {
      jsonrpc: "2.0",
      id: `${entry.address}:spl`,
      method: "getTokenAccountsByOwner",
      params: [
        entry.address,
        {
          programId: TOKEN_PROGRAM_ID,
        },
        {
          encoding: "jsonParsed",
        },
      ],
    },
    {
      jsonrpc: "2.0",
      id: `${entry.address}:token2022`,
      method: "getTokenAccountsByOwner",
      params: [
        entry.address,
        {
          programId: TOKEN_2022_PROGRAM_ID,
        },
        {
          encoding: "jsonParsed",
        },
      ],
    },
  ]);

  const rpcResults = await withRpcRetries(() => postRpcBatch(rpcUrl, requests));

  return input.entries.map((entry) => {
    const balanceRequestId = `${entry.address}:balance`;
    const splRequestId = `${entry.address}:spl`;
    const token2022RequestId = `${entry.address}:token2022`;
    const lamports = parseLamports(getRpcBatchResult(rpcResults, balanceRequestId), balanceRequestId);
    const parsedTokenBalances = [
      ...parseTokenAccountEntries(getRpcBatchResult(rpcResults, splRequestId)).map((tokenAccountEntry) =>
        parseTokenAccountBalance(tokenAccountEntry, { tokenProgram: "spl-token", programId: TOKEN_PROGRAM_ID })),
      ...parseTokenAccountEntries(getRpcBatchResult(rpcResults, token2022RequestId)).map((tokenAccountEntry) =>
        parseTokenAccountBalance(tokenAccountEntry, { tokenProgram: "token-2022", programId: TOKEN_2022_PROGRAM_ID })),
    ].filter((tokenBalance): tokenBalance is ParsedTokenAccountBalance => tokenBalance !== null);

    const tokenBalances = aggregateTokenBalances(parsedTokenBalances, input.includeZeroBalances);
    return {
      walletId: entry.walletId,
      walletGroup: entry.walletGroup,
      walletName: entry.walletName,
      address: entry.address,
      balanceLamports: lamports.toString(),
      balanceSol: Number(lamports) / LAMPORTS_PER_SOL,
      tokenCount: tokenBalances.length,
      tokenBalances,
    };
  });
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

const loadWalletsWithLoader = async (
  entries: ManagedWalletLibraryEntry[],
  loadWalletContents: (input: {
    rpcUrl?: string;
    address: string;
    includeZeroBalances: boolean;
  }) => Promise<LoadWalletContentsResult>,
  options: {
    rpcUrl?: string;
    includeZeroBalances: boolean;
  },
): Promise<Array<{
  walletId: string;
  walletGroup: string;
  walletName: string;
  address: string;
  balanceLamports: string;
    balanceSol: number;
    tokenCount: number;
    tokenBalances: ManagedWalletTokenBalance[];
  }>> => {
  return Promise.all(
    entries.map(async (entry) => {
      const contents = await loadWalletContents({
        rpcUrl: options.rpcUrl,
        address: entry.address,
        includeZeroBalances: options.includeZeroBalances,
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
};

export const createGetManagedWalletContentsAction = (
  deps: GetManagedWalletContentsDeps = {},
): Action<GetManagedWalletContentsInput, unknown> => {
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
        const wallets = deps.loadWalletContents
          ? await loadWalletsWithLoader(filteredEntries, deps.loadWalletContents, {
              rpcUrl: ctx.rpcUrl,
              includeZeroBalances: input.includeZeroBalances,
            })
          : await loadWalletContentsBatchFromRpc({
              entries: filteredEntries,
              rpcUrl: ctx.rpcUrl,
              includeZeroBalances: input.includeZeroBalances,
            });

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
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          retryable: isRetryableRpcError(error),
          error: message,
          code: isRetryableRpcError(error) ? "GET_MANAGED_WALLET_CONTENTS_RATE_LIMITED" : "GET_MANAGED_WALLET_CONTENTS_FAILED",
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }
    },
  };
};

export const getManagedWalletContentsAction = createGetManagedWalletContentsAction();
