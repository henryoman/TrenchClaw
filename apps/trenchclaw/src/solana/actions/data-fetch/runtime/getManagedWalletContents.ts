import path from "node:path";

import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import { scheduleRateLimitedRpcRequest } from "../../../lib/rpc/client";
import { resolveHeliusRpcConfig } from "../../../lib/rpc/helius";
import { resolveRequiredRpcUrl } from "../../../lib/rpc/urls";
import {
  managedWalletSelectorListSchema,
  managedWalletSelectorSchema,
  resolveManagedWalletEntriesBySelection,
} from "../../../lib/wallet/wallet-selector";
import {
  readManagedWalletLibraryEntries,
  resolveWalletKeypairRootPathForInstanceId,
} from "../../../lib/wallet/wallet-manager";
import {
  DEFAULT_WALLET_LIBRARY_FILE_NAME,
  walletGroupNameSchema,
  walletNameSchema,
  type ManagedWalletLibraryEntry,
} from "../../../lib/wallet/wallet-types";
import { resolveInstanceId } from "./instance-memory-shared";

const maxWalletNames = 100;
const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const RPC_RETRY_MAX_ATTEMPTS = 4;
const RPC_RETRY_BASE_DELAY_MS = 300;
const PUBLIC_MAINNET_RPC_BATCH_WALLET_LIMIT = 4;
const DEFAULT_RPC_BATCH_WALLET_LIMIT = 12;
const PUBLIC_MAINNET_RPC_INTER_REQUEST_DELAY_MS = 350;
const PUBLIC_MAINNET_RPC_INTER_WALLET_DELAY_MS = 500;
const PUBLIC_MAINNET_RPC_RETRY_COOLDOWN_MS = 2_000;
const PRIVATE_RPC_INTER_REQUEST_DELAY_MS = 120;
const PRIVATE_RPC_INTER_WALLET_DELAY_MS = 200;
const RPC_REQUEST_TIMEOUT_MS = 8_000;
const HELIUS_DAS_PAGE_LIMIT = 1_000;
const HELIUS_FUNGIBLE_INTERFACES = new Set(["FungibleAsset", "FungibleToken"]);

const getManagedWalletContentsInputSchema = z.object({
  instanceId: z.string().trim().min(1).max(64).optional(),
  wallet: managedWalletSelectorSchema.optional(),
  wallets: managedWalletSelectorListSchema.optional(),
  walletGroup: walletGroupNameSchema.optional(),
  walletNames: z.array(walletNameSchema).max(maxWalletNames).optional(),
  includeZeroBalances: z.boolean().default(false),
});

type GetManagedWalletContentsInput = z.output<typeof getManagedWalletContentsInputSchema>;
type TokenProgramLabel = "spl-token" | "token-2022";
type ManagedWalletContentsDataSource = "helius-das" | "rpc-batch" | "rpc-sequential";

export interface ManagedWalletTokenBalance {
  mintAddress: string;
  tokenProgram: TokenProgramLabel;
  programId: string;
  balanceRaw: string;
  balance: number;
  balanceUiString: string;
  decimals: number;
  tokenAccountAddresses: string[];
  assetId?: string | null;
  symbol?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  priceUsd?: number | null;
  valueUsd?: number | null;
}

export interface ManagedWalletContentsWallet {
  walletId: string;
  walletGroup: string;
  walletName: string;
  address: string;
  balanceLamports: string;
  balanceSol: number;
  tokenCount: number;
  tokenBalances: ManagedWalletTokenBalance[];
  assetCount: number;
  collectibleCount: number;
  compressedCollectibleCount: number;
  pricedTokenTotalUsd: number | null;
}

interface ManagedWalletAggregatedTokenBalance extends ManagedWalletTokenBalance {
  walletCount: number;
}

interface ManagedWalletContentsOutput {
  instanceId: string;
  walletCount: number;
  discoveredVia: "wallet-library";
  walletLibraryFilePath: string;
  invalidLibraryLineCount: number;
  includeZeroBalances: boolean;
  dataSource: ManagedWalletContentsDataSource;
  partial: boolean;
  wallets: ManagedWalletContentsWallet[];
  walletErrors: ManagedWalletContentsWalletError[];
  totalBalanceLamports: string;
  totalBalanceSol: number;
  totalCollectibleCount: number;
  totalPricedTokenUsd: number | null;
  tokenTotals: ManagedWalletAggregatedTokenBalance[];
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
  decimals: number;
  tokenAccountAddress: string | null;
  assetId?: string | null;
  symbol?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  priceUsd?: number | null;
  valueUsd?: number | null;
}

interface JsonRpcBatchRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: unknown;
}

interface WalletContentsAccumulator {
  entry: ManagedWalletLibraryEntry;
  lamports: bigint;
  tokenBalances: ParsedTokenAccountBalance[];
  assetCount: number;
  collectibleCount: number;
  compressedCollectibleCount: number;
}

interface ManagedWalletContentsWalletError {
  walletId: string;
  walletGroup: string;
  walletName: string;
  address: string;
  error: string;
  retryable: boolean;
}

interface ManagedWalletContentsLoadOutcome {
  wallets: ManagedWalletContentsWallet[];
  walletErrors: ManagedWalletContentsWalletError[];
  usedSequentialFallback: boolean;
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
    || /temporarily unavailable/iu.test(message)
    || /timed out/iu.test(message)
    || /\btimeout\b/iu.test(message)
    || /\babort(?:ed)?\b/iu.test(message);
};

const createRpcRequestSignal = (): AbortSignal | undefined => {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(RPC_REQUEST_TIMEOUT_MS);
  }
  return undefined;
};

const withRpcRetries = async <T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    onRetry?: (context: { attempt: number; delayMs: number; error: unknown }) => void | Promise<void>;
  } = {},
): Promise<T> => {
  const maxAttempts = options.maxAttempts ?? RPC_RETRY_MAX_ATTEMPTS;
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    try {
      // Retry/backoff must stay sequential so one transient failure does not fan out more RPC load.
      // eslint-disable-next-line no-await-in-loop
      return await operation();
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt >= maxAttempts || !isRetryableRpcError(error)) {
        throw error;
      }
      const delayMs = RPC_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      // Retry hooks must stay serialized with backoff state.
      // eslint-disable-next-line no-await-in-loop
      await options.onRetry?.({ attempt, delayMs, error });
      // Backoff waits must stay sequential between retry attempts.
      // eslint-disable-next-line no-await-in-loop
      await sleep(delayMs);
    }
  }

  throw lastError;
};

const toUiAmount = (balanceUiString: string): number => {
  const parsed = Number(balanceUiString);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toTrimmedStringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const isOfficialSolanaPublicRpcUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.hostname === "api.mainnet-beta.solana.com" || parsed.hostname === "api.devnet.solana.com";
  } catch {
    return false;
  }
};

const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toBigIntOrNull = (value: unknown): bigint | null => {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return BigInt(value);
  }
  return null;
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

const tokenProgramLabelFromProgramId = (programId: string): TokenProgramLabel =>
  programId === TOKEN_2022_PROGRAM_ID ? "token-2022" : "spl-token";

const sumKnownNumbers = (left: number | null | undefined, right: number | null | undefined): number | null => {
  if (typeof left === "number" && Number.isFinite(left) && typeof right === "number" && Number.isFinite(right)) {
    return left + right;
  }
  if (typeof left === "number" && Number.isFinite(left)) {
    return left;
  }
  if (typeof right === "number" && Number.isFinite(right)) {
    return right;
  }
  return null;
};

const sumTokenValuesUsd = (tokenBalances: ManagedWalletTokenBalance[]): number | null =>
  tokenBalances.reduce<number | null>((sum, tokenBalance) => sumKnownNumbers(sum, tokenBalance.valueUsd), null);

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

  if (!mintAddress || !amountRawString) {
    return null;
  }

  return {
    mintAddress,
    tokenProgram: defaults.tokenProgram,
    programId: accountProgramId,
    amountRaw: BigInt(amountRawString),
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
    assetId: string | null;
    symbol: string | null;
    name: string | null;
    imageUrl: string | null;
    priceUsd: number | null;
    valueUsd: number | null;
  }>();

  for (const balance of balances) {
    if (!includeZeroBalances && balance.amountRaw === 0n) {
      continue;
    }

    const key = `${balance.programId}:${balance.mintAddress}:${balance.decimals}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.amountRaw += balance.amountRaw;
      if (balance.tokenAccountAddress) {
        existing.tokenAccountAddresses.push(balance.tokenAccountAddress);
      }
      existing.assetId ??= balance.assetId ?? null;
      existing.symbol ??= balance.symbol ?? null;
      existing.name ??= balance.name ?? null;
      existing.imageUrl ??= balance.imageUrl ?? null;
      existing.priceUsd ??= balance.priceUsd ?? null;
      existing.valueUsd = sumKnownNumbers(existing.valueUsd, balance.valueUsd);
      continue;
    }

    grouped.set(key, {
      mintAddress: balance.mintAddress,
      tokenProgram: balance.tokenProgram,
      programId: balance.programId,
      amountRaw: balance.amountRaw,
      decimals: balance.decimals,
      tokenAccountAddresses: balance.tokenAccountAddress ? [balance.tokenAccountAddress] : [],
      assetId: balance.assetId ?? null,
      symbol: balance.symbol ?? null,
      name: balance.name ?? null,
      imageUrl: balance.imageUrl ?? null,
      priceUsd: balance.priceUsd ?? null,
      valueUsd: balance.valueUsd ?? null,
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
        assetId: entry.assetId,
        symbol: entry.symbol,
        name: entry.name,
        imageUrl: entry.imageUrl,
        priceUsd: entry.priceUsd,
        valueUsd: entry.valueUsd,
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

const getRpcBatchResult = (entries: Map<string, unknown>, requestId: string): unknown => {
  if (!entries.has(requestId)) {
    throw new Error(`RPC batch response did not include result for ${requestId}`);
  }
  return entries.get(requestId);
};

const parseLamports = (result: unknown, requestId: string): bigint => {
  if (!isRecord(result)) {
    throw new Error(`RPC ${requestId} returned an invalid balance payload`);
  }

  const lamports = toBigIntOrNull(result.value);
  if (lamports !== null) {
    return lamports;
  }

  throw new Error(`RPC ${requestId} returned a non-numeric balance`);
};

const parseTokenAccountEntries = (result: unknown): unknown[] => {
  if (!isRecord(result)) {
    return [];
  }
  return Array.isArray(result.value) ? result.value : [];
};

const chunkEntries = <T>(entries: T[], chunkSize: number): T[][] => {
  if (chunkSize <= 0 || entries.length === 0) {
    return entries.length === 0 ? [] : [entries];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < entries.length; index += chunkSize) {
    chunks.push(entries.slice(index, index + chunkSize));
  }
  return chunks;
};

const toWalletReadError = (
  entry: ManagedWalletLibraryEntry,
  error: unknown,
): ManagedWalletContentsWalletError => ({
  walletId: entry.walletId,
  walletGroup: entry.walletGroup,
  walletName: entry.walletName,
  address: entry.address,
  error: error instanceof Error ? error.message : String(error),
  retryable: isRetryableRpcError(error),
});

const postRpcBatch = async (
  rpcUrl: string,
  requests: JsonRpcBatchRequest[],
): Promise<Map<string, unknown>> => {
  let response: Response;
  try {
    response = await scheduleRateLimitedRpcRequest(rpcUrl, async () =>
      await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(requests),
        signal: createRpcRequestSignal(),
      }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timed out|timeout|abort/iu.test(message)) {
      throw new Error(`RPC request timed out after ${RPC_REQUEST_TIMEOUT_MS}ms`, { cause: error });
    }
    throw error;
  }
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

const postRpcSingle = async (
  rpcUrl: string,
  request: JsonRpcBatchRequest,
): Promise<unknown> => {
  const results = await postRpcBatch(rpcUrl, [request]);
  return getRpcBatchResult(results, request.id);
};

const buildWalletResult = (input: {
  entry: ManagedWalletLibraryEntry;
  lamports: bigint;
  tokenBalances: ManagedWalletTokenBalance[];
  assetCount?: number;
  collectibleCount?: number;
  compressedCollectibleCount?: number;
}): ManagedWalletContentsWallet => ({
  walletId: input.entry.walletId,
  walletGroup: input.entry.walletGroup,
  walletName: input.entry.walletName,
  address: input.entry.address,
  balanceLamports: input.lamports.toString(),
  balanceSol: Number(input.lamports) / LAMPORTS_PER_SOL,
  tokenCount: input.tokenBalances.length,
  tokenBalances: input.tokenBalances,
  assetCount: input.assetCount ?? input.tokenBalances.length,
  collectibleCount: input.collectibleCount ?? 0,
  compressedCollectibleCount: input.compressedCollectibleCount ?? 0,
  pricedTokenTotalUsd: sumTokenValuesUsd(input.tokenBalances),
});

const parseWalletRpcBatchResult = (input: {
  entry: ManagedWalletLibraryEntry;
  rpcResults: Map<string, unknown>;
  includeZeroBalances: boolean;
}): ManagedWalletContentsWallet => {
  const balanceRequestId = `${input.entry.address}:balance`;
  const splRequestId = `${input.entry.address}:spl`;
  const token2022RequestId = `${input.entry.address}:token2022`;
  const lamports = parseLamports(getRpcBatchResult(input.rpcResults, balanceRequestId), balanceRequestId);
  const parsedTokenBalances = [
    ...parseTokenAccountEntries(getRpcBatchResult(input.rpcResults, splRequestId)).map((tokenAccountEntry) =>
      parseTokenAccountBalance(tokenAccountEntry, { tokenProgram: "spl-token", programId: TOKEN_PROGRAM_ID })),
    ...parseTokenAccountEntries(getRpcBatchResult(input.rpcResults, token2022RequestId)).map((tokenAccountEntry) =>
      parseTokenAccountBalance(tokenAccountEntry, { tokenProgram: "token-2022", programId: TOKEN_2022_PROGRAM_ID })),
  ].filter((tokenBalance): tokenBalance is ParsedTokenAccountBalance => tokenBalance !== null);

  const tokenBalances = aggregateTokenBalances(parsedTokenBalances, input.includeZeroBalances);
  return buildWalletResult({
    entry: input.entry,
    lamports,
    tokenBalances,
  });
};

const loadWalletContentsBatchFromRpc = async (input: {
  rpcUrl?: string;
  entries: ManagedWalletLibraryEntry[];
  includeZeroBalances: boolean;
}): Promise<ManagedWalletContentsWallet[]> => {
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

  const rpcResults = await withRpcRetries(
    () => postRpcBatch(rpcUrl, requests),
    {
      maxAttempts: isOfficialSolanaPublicRpcUrl(rpcUrl) ? 2 : RPC_RETRY_MAX_ATTEMPTS,
    },
  );

  return input.entries.map((entry) =>
    parseWalletRpcBatchResult({
      entry,
      rpcResults,
      includeZeroBalances: input.includeZeroBalances,
    }));
};

const loadWalletContentsSequentiallyFromRpc = async (input: {
  rpcUrl?: string;
  entries: ManagedWalletLibraryEntry[];
  includeZeroBalances: boolean;
}): Promise<ManagedWalletContentsLoadOutcome> => {
  if (input.entries.length === 0) {
    return {
      wallets: [],
      walletErrors: [],
      usedSequentialFallback: false,
    };
  }

  const rpcUrl = resolveRequiredRpcUrl(input.rpcUrl);
  const wallets: ManagedWalletContentsWallet[] = [];
  const walletErrors: ManagedWalletContentsWalletError[] = [];
  const isPublicRpc = isOfficialSolanaPublicRpcUrl(rpcUrl);
  const interRequestDelayMs = isPublicRpc ? PUBLIC_MAINNET_RPC_INTER_REQUEST_DELAY_MS : PRIVATE_RPC_INTER_REQUEST_DELAY_MS;
  const interWalletDelayMs = isPublicRpc ? PUBLIC_MAINNET_RPC_INTER_WALLET_DELAY_MS : PRIVATE_RPC_INTER_WALLET_DELAY_MS;
  const maxAttempts = isPublicRpc ? 2 : RPC_RETRY_MAX_ATTEMPTS;

  for (const entry of input.entries) {
    const balanceRequest: JsonRpcBatchRequest = {
      jsonrpc: "2.0",
      id: `${entry.address}:balance`,
      method: "getBalance",
      params: [entry.address],
    };
    const splRequest: JsonRpcBatchRequest = {
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
    };
    const token2022Request: JsonRpcBatchRequest = {
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
    };

    const rpcResults = new Map<string, unknown>();
    let walletFailed = false;
    for (const request of [balanceRequest, splRequest, token2022Request]) {
      let requestSawRetry = false;
      // Keep these reads fully serialized so public RPCs do not reject inventory lookups.
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await withRpcRetries(
          () => postRpcSingle(rpcUrl, request),
          {
            maxAttempts,
            onRetry: () => {
              requestSawRetry = true;
            },
          },
        );
        rpcResults.set(request.id, result);
      } catch (error) {
        if (!isRetryableRpcError(error)) {
          throw error;
        }
        walletErrors.push(toWalletReadError(entry, error));
        walletFailed = true;
        if (isPublicRpc) {
          // Give public RPCs a short reset window after a throttled wallet before moving on.
          // eslint-disable-next-line no-await-in-loop
          await sleep(PUBLIC_MAINNET_RPC_RETRY_COOLDOWN_MS);
        }
        break;
      }

      // Avoid fixed long sleeps on healthy reads; only slow down aggressively after actual retries.
      // eslint-disable-next-line no-await-in-loop
      await sleep(requestSawRetry && isPublicRpc ? PUBLIC_MAINNET_RPC_RETRY_COOLDOWN_MS : interRequestDelayMs);
    }
    if (walletFailed) {
      continue;
    }
    wallets.push(
      parseWalletRpcBatchResult({
        entry,
        rpcResults,
        includeZeroBalances: input.includeZeroBalances,
      }),
    );

    // Give public RPCs a short breather between wallets when we already had to degrade from batching.
    if (wallets.length + walletErrors.length < input.entries.length) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(interWalletDelayMs);
    }
  }

  return {
    wallets,
    walletErrors,
    usedSequentialFallback: true,
  };
};

const parseHeliusNativeLamports = (result: unknown): bigint => {
  if (!isRecord(result)) {
    return 0n;
  }
  const nativeBalance = isRecord(result.nativeBalance) ? result.nativeBalance : null;
  return nativeBalance ? toBigIntOrNull(nativeBalance.lamports) ?? 0n : 0n;
};

const isHeliusFungibleAsset = (entry: Record<string, unknown>): boolean => {
  const interfaceName = toTrimmedStringOrNull(entry.interface);
  if (interfaceName && HELIUS_FUNGIBLE_INTERFACES.has(interfaceName)) {
    return true;
  }
  return isRecord(entry.token_info);
};

const parseHeliusFungibleAsset = (entry: unknown): ParsedTokenAccountBalance | null => {
  if (!isRecord(entry) || !isHeliusFungibleAsset(entry)) {
    return null;
  }

  const assetId = toTrimmedStringOrNull(entry.id);
  const tokenInfo = isRecord(entry.token_info) ? entry.token_info : null;
  const content = isRecord(entry.content) ? entry.content : null;
  const metadata = content && isRecord(content.metadata) ? content.metadata : null;
  const links = content && isRecord(content.links) ? content.links : null;

  const amountRaw = tokenInfo ? toBigIntOrNull(tokenInfo.balance) : null;
  if (!assetId || amountRaw === null) {
    return null;
  }

  const decimals = tokenInfo ? toFiniteNumberOrNull(tokenInfo.decimals) ?? 0 : 0;
  const programId = tokenInfo
    ? toTrimmedStringOrNull(tokenInfo.token_program) ?? TOKEN_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
  const priceInfo = tokenInfo && isRecord(tokenInfo.price_info) ? tokenInfo.price_info : null;

  return {
    mintAddress: assetId,
    tokenProgram: tokenProgramLabelFromProgramId(programId),
    programId,
    amountRaw,
    decimals,
    tokenAccountAddress: tokenInfo ? toTrimmedStringOrNull(tokenInfo.associated_token_address) : null,
    assetId,
    symbol: metadata ? toTrimmedStringOrNull(metadata.symbol) : null,
    name: metadata ? toTrimmedStringOrNull(metadata.name) : null,
    imageUrl: links ? toTrimmedStringOrNull(links.image) : null,
    priceUsd: priceInfo ? toFiniteNumberOrNull(priceInfo.price_per_token) : null,
    valueUsd: priceInfo ? toFiniteNumberOrNull(priceInfo.total_price) : null,
  };
};

const mergeHeliusDasPage = (
  accumulator: WalletContentsAccumulator,
  result: unknown,
  page: number,
): { hasMorePages: boolean } => {
  if (!isRecord(result)) {
    return { hasMorePages: false };
  }

  if (page === 1) {
    accumulator.lamports = parseHeliusNativeLamports(result);
  }

  const items = Array.isArray(result.items) ? result.items : [];
  accumulator.assetCount += items.length;

  for (const item of items) {
    const fungibleToken = parseHeliusFungibleAsset(item);
    if (fungibleToken) {
      accumulator.tokenBalances.push(fungibleToken);
      continue;
    }

    if (!isRecord(item)) {
      continue;
    }

    accumulator.collectibleCount += 1;
    const compression = isRecord(item.compression) ? item.compression : null;
    if (compression?.compressed === true) {
      accumulator.compressedCollectibleCount += 1;
    }
  }

  return { hasMorePages: items.length >= HELIUS_DAS_PAGE_LIMIT };
};

const loadWalletContentsBatchFromHeliusDas = async (input: {
  rpcUrl: string;
  entries: ManagedWalletLibraryEntry[];
  includeZeroBalances: boolean;
}): Promise<ManagedWalletContentsWallet[]> => {
  if (input.entries.length === 0) {
    return [];
  }

  const accumulators = new Map<string, WalletContentsAccumulator>(
    input.entries.map((entry) => [
      entry.address,
      {
        entry,
        lamports: 0n,
        tokenBalances: [],
        assetCount: 0,
        collectibleCount: 0,
        compressedCollectibleCount: 0,
      },
    ]),
  );

  const pendingPages = new Map<string, number>(input.entries.map((entry) => [entry.address, 1]));

  while (pendingPages.size > 0) {
    const pageBatch = input.entries
      .map((entry) => {
        const page = pendingPages.get(entry.address);
        return page ? { entry, page } : null;
      })
      .filter((entry): entry is { entry: ManagedWalletLibraryEntry; page: number } => entry !== null);

    const requests = pageBatch.map(({ entry, page }): JsonRpcBatchRequest => ({
      jsonrpc: "2.0",
      id: `${entry.address}:helius-das:${page}`,
      method: "getAssetsByOwner",
      params: {
        ownerAddress: entry.address,
        page,
        limit: HELIUS_DAS_PAGE_LIMIT,
        displayOptions: {
          showFungible: true,
          showNativeBalance: true,
          showZeroBalance: input.includeZeroBalances,
        },
      },
    }));

    // DAS pagination is stateful across pages, so each batch must complete before the next one is requested.
    // eslint-disable-next-line no-await-in-loop
    const rpcResults = await withRpcRetries(() => postRpcBatch(input.rpcUrl, requests));

    for (const { entry, page } of pageBatch) {
      const accumulator = accumulators.get(entry.address);
      if (!accumulator) {
        continue;
      }

      const requestId = `${entry.address}:helius-das:${page}`;
      const pageResult = getRpcBatchResult(rpcResults, requestId);
      const { hasMorePages } = mergeHeliusDasPage(accumulator, pageResult, page);
      if (hasMorePages) {
        pendingPages.set(entry.address, page + 1);
      } else {
        pendingPages.delete(entry.address);
      }
    }
  }

  return input.entries.map((entry) => {
    const accumulator = accumulators.get(entry.address);
    if (!accumulator) {
      return buildWalletResult({
        entry,
        lamports: 0n,
        tokenBalances: [],
      });
    }

    const tokenBalances = aggregateTokenBalances(accumulator.tokenBalances, input.includeZeroBalances);
    return buildWalletResult({
      entry,
      lamports: accumulator.lamports,
      tokenBalances,
      assetCount: accumulator.assetCount,
      collectibleCount: accumulator.collectibleCount,
      compressedCollectibleCount: accumulator.compressedCollectibleCount,
    });
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

const resolveWalletEntries = async (
  entries: ManagedWalletLibraryEntry[],
  input: GetManagedWalletContentsInput,
): Promise<ManagedWalletLibraryEntry[]> => {
  const selectedEntries = await resolveManagedWalletEntriesBySelection(input);
  if (!selectedEntries) {
    return filterWalletEntries(entries, input);
  }

  const selectedWalletIds = new Set(selectedEntries.map((entry) => entry.walletId));
  return entries
    .filter((entry) => selectedWalletIds.has(entry.walletId))
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
): Promise<ManagedWalletContentsLoadOutcome> => {
  return {
    wallets: await Promise.all(
      entries.map(async (entry) => {
        const contents = await loadWalletContents({
          rpcUrl: options.rpcUrl,
          address: entry.address,
          includeZeroBalances: options.includeZeroBalances,
        });
        return buildWalletResult({
          entry,
          lamports: contents.lamports,
          tokenBalances: contents.tokenBalances,
        });
      }),
    ),
    walletErrors: [],
    usedSequentialFallback: false,
  };
};

const buildTokenTotals = (wallets: ManagedWalletContentsWallet[]): ManagedWalletAggregatedTokenBalance[] => {
  const tokenTotals = new Map<string, {
    mintAddress: string;
    tokenProgram: TokenProgramLabel;
    programId: string;
    decimals: number;
    amountRaw: bigint;
    walletIds: Set<string>;
    assetId: string | null;
    symbol: string | null;
    name: string | null;
    imageUrl: string | null;
    priceUsd: number | null;
    valueUsd: number | null;
  }>();

  for (const wallet of wallets) {
    for (const tokenBalance of wallet.tokenBalances) {
      const key = `${tokenBalance.programId}:${tokenBalance.mintAddress}:${tokenBalance.decimals}`;
      const existing = tokenTotals.get(key);
      if (existing) {
        existing.amountRaw += BigInt(tokenBalance.balanceRaw);
        existing.walletIds.add(wallet.walletId);
        existing.assetId ??= tokenBalance.assetId ?? null;
        existing.symbol ??= tokenBalance.symbol ?? null;
        existing.name ??= tokenBalance.name ?? null;
        existing.imageUrl ??= tokenBalance.imageUrl ?? null;
        existing.priceUsd ??= tokenBalance.priceUsd ?? null;
        existing.valueUsd = sumKnownNumbers(existing.valueUsd, tokenBalance.valueUsd);
        continue;
      }

      tokenTotals.set(key, {
        mintAddress: tokenBalance.mintAddress,
        tokenProgram: tokenBalance.tokenProgram,
        programId: tokenBalance.programId,
        decimals: tokenBalance.decimals,
        amountRaw: BigInt(tokenBalance.balanceRaw),
        walletIds: new Set([wallet.walletId]),
        assetId: tokenBalance.assetId ?? null,
        symbol: tokenBalance.symbol ?? null,
        name: tokenBalance.name ?? null,
        imageUrl: tokenBalance.imageUrl ?? null,
        priceUsd: tokenBalance.priceUsd ?? null,
        valueUsd: tokenBalance.valueUsd ?? null,
      });
    }
  }

  return Array.from(tokenTotals.values())
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
        tokenAccountAddresses: [],
        walletCount: entry.walletIds.size,
        assetId: entry.assetId,
        symbol: entry.symbol,
        name: entry.name,
        imageUrl: entry.imageUrl,
        priceUsd: entry.priceUsd,
        valueUsd: entry.valueUsd,
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
  entries: ManagedWalletLibraryEntry[];
  includeZeroBalances: boolean;
}): Promise<ManagedWalletContentsLoadOutcome> => {
  if (input.entries.length === 0) {
    return {
      wallets: [],
      walletErrors: [],
      usedSequentialFallback: false,
    };
  }

  const rpcUrl = resolveRequiredRpcUrl(input.rpcUrl);
  const isPublicRpc = isOfficialSolanaPublicRpcUrl(rpcUrl);
  const walletBatchLimit = isPublicRpc ? PUBLIC_MAINNET_RPC_BATCH_WALLET_LIMIT : DEFAULT_RPC_BATCH_WALLET_LIMIT;
  const entryChunks = chunkEntries(input.entries, walletBatchLimit);
  const wallets: ManagedWalletContentsWallet[] = [];
  const walletErrors: ManagedWalletContentsWalletError[] = [];
  let usedSequentialFallback = false;

  for (const entryChunk of entryChunks) {
    try {
      const chunkWallets = await loadWalletContentsBatchFromRpc({
        entries: entryChunk,
        rpcUrl,
        includeZeroBalances: input.includeZeroBalances,
      });
      wallets.push(...chunkWallets);
    } catch (error) {
      if (!isRetryableRpcError(error)) {
        throw error;
      }

      const sequentialOutcome = await loadWalletContentsSequentiallyFromRpc({
        entries: entryChunk,
        rpcUrl,
        includeZeroBalances: input.includeZeroBalances,
      });
      usedSequentialFallback = true;
      wallets.push(...sequentialOutcome.wallets);
      walletErrors.push(...sequentialOutcome.walletErrors);
    }
  }

  return {
    wallets,
    walletErrors,
    usedSequentialFallback,
  };
};

export const createGetManagedWalletContentsAction = (
  deps: GetManagedWalletContentsDeps = {},
): Action<GetManagedWalletContentsInput, ManagedWalletContentsOutput> => {
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

        const discoveredVia = "wallet-library";
        const entries = walletLibrary.entries;

        const filteredEntries = await resolveWalletEntries(entries, input);
        const heliusConfig = deps.loadWalletContents
          ? null
          : await resolveHeliusRpcConfig({
              activeInstanceId: instanceId,
              rpcUrl: ctx.rpcUrl,
              requireSelectedProvider: true,
            });

        const useHeliusDas = Boolean(heliusConfig?.rpcUrl);
        let dataSource: ManagedWalletContentsDataSource = "rpc-batch";
        const loadOutcome = deps.loadWalletContents
          ? await loadWalletsWithLoader(filteredEntries, deps.loadWalletContents, {
              rpcUrl: ctx.rpcUrl,
              includeZeroBalances: input.includeZeroBalances,
            })
          : useHeliusDas && heliusConfig?.rpcUrl
            ? {
                wallets: await loadWalletContentsBatchFromHeliusDas({
                  entries: filteredEntries,
                  rpcUrl: heliusConfig.rpcUrl,
                  includeZeroBalances: input.includeZeroBalances,
                }),
                walletErrors: [],
                usedSequentialFallback: false,
              }
            : await loadWalletContentsFromRpc({
                entries: filteredEntries,
                rpcUrl: ctx.rpcUrl,
                includeZeroBalances: input.includeZeroBalances,
              });
        if (useHeliusDas) {
          dataSource = "helius-das";
        } else if (loadOutcome.usedSequentialFallback) {
          dataSource = "rpc-sequential";
        }

        const wallets = loadOutcome.wallets;
        if (wallets.length === 0 && loadOutcome.walletErrors.length > 0) {
          throw new Error(loadOutcome.walletErrors[0]?.error ?? "Managed-wallet RPC reads failed.");
        }

        const totalBalanceLamports = wallets.reduce((sum, wallet) => sum + BigInt(wallet.balanceLamports), 0n);
        const aggregatedTokenTotals = buildTokenTotals(wallets);

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
            dataSource,
            partial: loadOutcome.walletErrors.length > 0,
            wallets,
            walletErrors: loadOutcome.walletErrors,
            totalBalanceLamports: totalBalanceLamports.toString(),
            totalBalanceSol: Number(totalBalanceLamports) / LAMPORTS_PER_SOL,
            totalCollectibleCount: wallets.reduce((sum, wallet) => sum + wallet.collectibleCount, 0),
            totalPricedTokenUsd: wallets.reduce<number | null>(
              (sum, wallet) => sumKnownNumbers(sum, wallet.pricedTokenTotalUsd),
              null,
            ),
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
