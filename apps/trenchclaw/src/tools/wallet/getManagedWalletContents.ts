import { createHash } from "node:crypto";
import path from "node:path";

import { z } from "zod";

import type { ActionContext } from "../../ai/contracts/types/context";
import type { Action } from "../../ai/contracts/types/action";
import type { JobState } from "../../ai/contracts/types/state";
import {
  applyRpcRateLimitCooldown,
  parseRetryAfterMs,
  scheduleRateLimitedRpcRequest,
  type RpcRequestLane,
  type RpcRequestSchedulingOptions,
} from "../../solana/lib/rpc/client";
import { resolveHeliusRpcConfig } from "../../solana/lib/rpc/helius";
import { resolveRequiredRpcUrl } from "../../solana/lib/rpc/urls";
import {
  managedWalletSelectorListSchema,
  managedWalletSelectorSchema,
  resolveManagedWalletEntriesBySelection,
} from "../../solana/lib/wallet/walletSelector";
import {
  readManagedWalletLibraryEntries,
  resolveWalletKeypairRootPathForInstanceId,
} from "../../solana/lib/wallet/walletManager";
import {
  DEFAULT_WALLET_LIBRARY_FILE_NAME,
  walletGroupNameSchema,
  walletNameSchema,
  type ManagedWalletLibraryEntry,
} from "../../solana/lib/wallet/walletTypes";
import { resolveInstanceId } from "../core/instanceMemoryShared";

const maxWalletNames = 100;
const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const RPC_RETRY_MAX_ATTEMPTS = 4;
const RPC_RETRY_BASE_DELAY_MS = 300;
const WALLET_BATCH_RETRY_MAX_ATTEMPTS = 1;
const WALLET_SEQUENTIAL_RETRY_MAX_ATTEMPTS = 2;
const HELIUS_DAS_RETRY_MAX_ATTEMPTS = 1;
const PUBLIC_MAINNET_RPC_BATCH_WALLET_LIMIT = 4;
const DEFAULT_RPC_BATCH_WALLET_LIMIT = 12;
const PUBLIC_MAINNET_RPC_INTER_REQUEST_DELAY_MS = 350;
const PUBLIC_MAINNET_RPC_INTER_WALLET_DELAY_MS = 500;
const PUBLIC_MAINNET_RPC_RETRY_COOLDOWN_MS = 2_000;
const PRIVATE_RPC_INTER_REQUEST_DELAY_MS = 120;
const PRIVATE_RPC_INTER_WALLET_DELAY_MS = 200;
const HELIUS_DAS_INTER_PAGE_DELAY_MS = 180;
const HELIUS_DAS_INTER_WALLET_DELAY_MS = 250;
const RPC_REQUEST_TIMEOUT_MS = 8_000;
const HELIUS_DAS_PAGE_LIMIT = 1_000;
const HELIUS_FUNGIBLE_INTERFACES = new Set(["FungibleAsset", "FungibleToken"]);
const DEFAULT_RPC_RATE_LIMIT_COOLDOWN_MS = 2_000;
const INLINE_HELIUS_DAS_WALLET_LIMIT = 2;
const INLINE_RPC_WALLET_LIMIT = 4;
const INLINE_SIMPLE_WALLET_LIMIT = 24;
const WALLET_INVENTORY_SCAN_ROUTINE_NAME = "walletInventoryScan";
const WALLET_CONTENTS_SCAN_ROUTINE_NAME = "walletContentsScan";
const WALLET_BALANCE_CACHE_TTL_MS = 15_000;

const getManagedWalletContentsInputSchema = z.object({
  instanceId: z.string().trim().min(1).max(64).optional(),
  wallet: managedWalletSelectorSchema.optional(),
  wallets: managedWalletSelectorListSchema.optional(),
  walletGroup: walletGroupNameSchema.optional(),
  walletNames: z.array(walletNameSchema).max(maxWalletNames).optional(),
  includeZeroBalances: z.boolean().default(false),
});

type GetManagedWalletContentsInput = z.output<typeof getManagedWalletContentsInputSchema>;
const getWalletContentsInputSchema = z.object({
  instanceId: z.string().trim().min(1).max(64).optional(),
  wallets: managedWalletSelectorListSchema.optional(),
  includeZeroBalances: z.boolean().default(false),
});

type GetWalletContentsInput = z.output<typeof getWalletContentsInputSchema>;
type TokenProgramLabel = "spl-token" | "token-2022";
type ManagedWalletContentsDataSource = "helius-das" | "rpc-batch" | "rpc-sequential";

interface WalletContentWarning {
  code: string;
  message: string;
}

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
  snapshotAt: number;
  walletCount: number;
  discoveredVia: "wallet-library";
  walletLibraryFilePath: string;
  invalidLibraryLineCount: number;
  includeZeroBalances: boolean;
  dataSource: ManagedWalletContentsDataSource;
  partial: boolean;
  warnings: WalletContentWarning[];
  wallets: ManagedWalletContentsWallet[];
  walletErrors: ManagedWalletContentsWalletError[];
  totalBalanceLamports: string;
  totalBalanceSol: number;
  totalCollectibleCount: number;
  totalPricedTokenUsd: number | null;
  tokenTotals: ManagedWalletAggregatedTokenBalance[];
}

interface ManagedWalletContentsQueuedOutput {
  queued: true;
  requestKey: string;
  job: {
    id: string;
    serialNumber: number | null;
    status: JobState["status"];
    routineName: string;
    createdAt: number;
    updatedAt: number;
  };
  message: string;
}

type ManagedWalletContentsActionData = ManagedWalletContentsOutput | ManagedWalletContentsQueuedOutput;

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

interface WalletBalanceCacheEntry {
  expiresAt: number;
  wallet: ManagedWalletContentsWallet;
}

const walletBalanceCache = new Map<string, WalletBalanceCacheEntry>();

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

interface WalletScanReuseResult {
  status: "queued" | "completed";
  job: JobState;
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

const isBatchUnsupportedRpcError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /\b403\b/u.test(message)
    && /batch requests?/iu.test(message)
    && (
      /paid plans?/iu.test(message)
      || /upgrade/iu.test(message)
      || /only available/iu.test(message)
      || /-32403/u.test(message)
    );
};

const isRpcRateLimitErrorPayload = (error: unknown): boolean => {
  if (!isRecord(error)) {
    return false;
  }

  const code = typeof error.code === "number" || typeof error.code === "string" ? String(error.code) : "";
  const message = typeof error.message === "string" ? error.message : "";
  return code === "429" || /\b429\b/u.test(message) || /too many requests|rate limit/iu.test(message);
};

const extractRetryAfterMsFromError = (error: unknown): number | null => {
  if (!isRecord(error)) {
    return null;
  }

  const directRetryAfter = parseRetryAfterMs(
    typeof error.retryAfter === "string" || typeof error.retryAfter === "number"
      ? String(error.retryAfter)
      : null,
  );
  if (directRetryAfter !== null) {
    return directRetryAfter;
  }

  if (isRecord(error.data)) {
    const dataRetryAfter = parseRetryAfterMs(
      typeof error.data.retryAfter === "string" || typeof error.data.retryAfter === "number"
        ? String(error.data.retryAfter)
        : null,
    );
    if (dataRetryAfter !== null) {
      return dataRetryAfter;
    }
  }

  const message = typeof error.message === "string" ? error.message : "";
  const secondsMatch = message.match(/retry after\s+(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?/iu);
  if (secondsMatch) {
    return Math.round(Number(secondsMatch[1]) * 1000);
  }

  const millisecondsMatch = message.match(/retry after\s+(\d+)\s*ms/iu);
  if (millisecondsMatch) {
    return Number(millisecondsMatch[1]);
  }

  return null;
};

const resolveRpcSchedulingOptions = (
  rpcUrl: string,
  requests: JsonRpcBatchRequest[],
  options: RpcRequestSchedulingOptions = {},
): RpcRequestSchedulingOptions => {
  const uniqueMethods = [...new Set(requests.map((request) => request.method))];
  const methodFamily =
    options.methodFamily
    ?? (
      uniqueMethods.length === 1
        ? uniqueMethods[0]
        : uniqueMethods.includes("getAssetsByOwner")
          ? "getAssetsByOwner"
          : uniqueMethods.every((method) => method === "getBalance" || method === "getTokenAccountsByOwner")
            ? "wallet-batch"
            : "mixed-batch"
    );

  return {
    providerHint: options.providerHint ?? (isOfficialSolanaPublicRpcUrl(rpcUrl) ? "solana-rpc" : "helius-rpc"),
    methodFamily,
    lane: options.lane ?? "inline",
  };
};

const getWalletContentsRequestLane = (ctx: ActionContext): RpcRequestLane =>
  ctx.jobMeta ? "background" : "inline";

const classifyWalletContentsRead = (input: {
  ctx: ActionContext;
  walletCount: number;
  useHeliusDas: boolean;
  hasCustomLoader: boolean;
}): "inline" | "queued" => {
  if (input.walletCount === 0 || input.hasCustomLoader || input.ctx.jobMeta || !input.ctx.enqueueJob || !input.ctx.stateStore) {
    return "inline";
  }

  const inlineLimit = input.useHeliusDas ? INLINE_HELIUS_DAS_WALLET_LIMIT : INLINE_RPC_WALLET_LIMIT;
  return input.walletCount > inlineLimit ? "queued" : "inline";
};

const buildWalletScanRequestKey = (input: {
  instanceId: string;
  includeZeroBalances: boolean;
  useHeliusDas: boolean;
  entries: ManagedWalletLibraryEntry[];
}): string => {
  const digest = createHash("sha256")
    .update(JSON.stringify({
      instanceId: input.instanceId,
      includeZeroBalances: input.includeZeroBalances,
      provider: input.useHeliusDas ? "helius-das" : "rpc",
      walletIds: input.entries.map((entry) => entry.walletId),
    }))
    .digest("hex")
    .slice(0, 24);
  return `wallet-contents:${digest}`;
};

const createQueuedWalletContentsPayload = (
  job: JobState,
  requestKey: string,
  message: string,
): ManagedWalletContentsQueuedOutput => ({
  queued: true,
  requestKey,
  job: {
    id: job.id,
    serialNumber: job.serialNumber ?? null,
    status: job.status,
    routineName: job.routineName,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  },
  message,
});

const resolveReusableWalletScanJob = (
  ctx: ActionContext,
  requestKey: string,
  routineName = WALLET_INVENTORY_SCAN_ROUTINE_NAME,
): WalletScanReuseResult | null => {
  const jobs = ctx.stateStore
    ?.listJobs()
    .filter((job) =>
      job.routineName === routineName
      && isRecord(job.config)
      && job.config.requestKey === requestKey)
    .toSorted((left, right) => right.createdAt - left.createdAt);

  const reusableJob = jobs?.find((job) =>
    job.status === "pending"
    || job.status === "running"
    || job.status === "paused"
    || (job.status === "stopped" && job.lastResult?.ok === true));

  if (!reusableJob) {
    return null;
  }

  return {
    status: reusableJob.status === "stopped" ? "completed" : "queued",
    job: reusableJob,
  };
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

const normalizeRpcCacheKeySegment = (value: string | undefined): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "no-rpc";
  }
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return trimmed;
  }
};

const cloneWalletTokenBalance = (tokenBalance: ManagedWalletTokenBalance): ManagedWalletTokenBalance => ({
  ...tokenBalance,
  tokenAccountAddresses: [...tokenBalance.tokenAccountAddresses],
});

const cloneWalletContentsWallet = (wallet: ManagedWalletContentsWallet): ManagedWalletContentsWallet => ({
  ...wallet,
  tokenBalances: wallet.tokenBalances.map(cloneWalletTokenBalance),
});

const buildWalletBalanceCacheKey = (input: {
  rpcUrl?: string;
  walletAddress: string;
  includeZeroBalances: boolean;
}): string => `${normalizeRpcCacheKeySegment(input.rpcUrl)}:${input.walletAddress}:${input.includeZeroBalances ? "with-zeroes" : "non-zero"}`;

const getCachedWalletBalance = (input: {
  rpcUrl?: string;
  walletAddress: string;
  includeZeroBalances: boolean;
}): ManagedWalletContentsWallet | null => {
  const cacheKey = buildWalletBalanceCacheKey(input);
  const cached = walletBalanceCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    walletBalanceCache.delete(cacheKey);
    return null;
  }
  return cloneWalletContentsWallet(cached.wallet);
};

const setCachedWalletBalance = (input: {
  rpcUrl?: string;
  walletAddress: string;
  includeZeroBalances: boolean;
  wallet: ManagedWalletContentsWallet;
}): void => {
  const cacheKey = buildWalletBalanceCacheKey(input);
  walletBalanceCache.set(cacheKey, {
    expiresAt: Date.now() + WALLET_BALANCE_CACHE_TTL_MS,
    wallet: cloneWalletContentsWallet(input.wallet),
  });
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

const postRpcBatchDetailed = async (
  rpcUrl: string,
  requests: JsonRpcBatchRequest[],
  options: RpcRequestSchedulingOptions = {},
): Promise<{
  results: Map<string, unknown>;
  errors: Map<string, unknown>;
}> => {
  const scheduling = resolveRpcSchedulingOptions(rpcUrl, requests, options);
  let response: Response;
  try {
    response = await scheduleRateLimitedRpcRequest(
      rpcUrl,
      async () =>
        await fetch(rpcUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(requests),
          signal: createRpcRequestSignal(),
        }),
      scheduling,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timed out|timeout|abort/iu.test(message)) {
      throw new Error(`RPC request timed out after ${RPC_REQUEST_TIMEOUT_MS}ms`, { cause: error });
    }
    throw error;
  }
  const responseText = await response.text();

  if (!response.ok) {
    if (response.status === 429) {
      applyRpcRateLimitCooldown(
        rpcUrl,
        parseRetryAfterMs(response.headers.get("retry-after")) ?? DEFAULT_RPC_RATE_LIMIT_COOLDOWN_MS,
        scheduling,
      );
    }
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
  const errors = new Map<string, unknown>();
  for (const entry of payload) {
    if (!isRecord(entry)) {
      continue;
    }
    const requestId = typeof entry.id === "string" || typeof entry.id === "number" ? String(entry.id) : null;
    if (!requestId) {
      continue;
    }
    if ("error" in entry && entry.error !== undefined) {
      if (isRpcRateLimitErrorPayload(entry.error)) {
        applyRpcRateLimitCooldown(
          rpcUrl,
          extractRetryAfterMsFromError(entry.error) ?? DEFAULT_RPC_RATE_LIMIT_COOLDOWN_MS,
          scheduling,
        );
      }
      errors.set(requestId, entry.error);
      continue;
    }
    if (!("result" in entry)) {
      errors.set(requestId, new Error(`RPC ${requestId} returned no result`));
      continue;
    }
    results.set(requestId, entry.result);
  }

  return {
    results,
    errors,
  };
};

const postRpcBatch = async (
  rpcUrl: string,
  requests: JsonRpcBatchRequest[],
  options: RpcRequestSchedulingOptions = {},
): Promise<Map<string, unknown>> => {
  const detailed = await postRpcBatchDetailed(rpcUrl, requests, options);
  const firstError = detailed.errors.entries().next();
  if (!firstError.done) {
    const [requestId, error] = firstError.value;
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`RPC ${requestId} failed: ${formatRpcError(error)}`);
  }
  return detailed.results;
};

const postRpcSingle = async (
  rpcUrl: string,
  request: JsonRpcBatchRequest,
  options: RpcRequestSchedulingOptions = {},
): Promise<unknown> => {
  const results = await postRpcBatch(rpcUrl, [request], options);
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

const getWalletRpcRequestIds = (entry: ManagedWalletLibraryEntry): {
  balanceRequestId: string;
  splRequestId: string;
  token2022RequestId: string;
} => ({
  balanceRequestId: `${entry.address}:balance`,
  splRequestId: `${entry.address}:spl`,
  token2022RequestId: `${entry.address}:token2022`,
});

const buildWalletRpcRequests = (entry: ManagedWalletLibraryEntry): JsonRpcBatchRequest[] => {
  const { balanceRequestId, splRequestId, token2022RequestId } = getWalletRpcRequestIds(entry);
  return [
    {
      jsonrpc: "2.0",
      id: balanceRequestId,
      method: "getBalance",
      params: [entry.address],
    },
    {
      jsonrpc: "2.0",
      id: splRequestId,
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
      id: token2022RequestId,
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
  ];
};

const parseWalletRpcBatchResult = (input: {
  entry: ManagedWalletLibraryEntry;
  rpcResults: Map<string, unknown>;
  includeZeroBalances: boolean;
}): ManagedWalletContentsWallet => {
  const { balanceRequestId, splRequestId, token2022RequestId } = getWalletRpcRequestIds(input.entry);
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

interface WalletBatchRpcLoadOutcome {
  wallets: ManagedWalletContentsWallet[];
  failedEntries: ManagedWalletLibraryEntry[];
}

const loadWalletContentsBatchFromRpc = async (input: {
  rpcUrl?: string;
  entries: ManagedWalletLibraryEntry[];
  includeZeroBalances: boolean;
  lane?: RpcRequestLane;
}): Promise<WalletBatchRpcLoadOutcome> => {
  if (input.entries.length === 0) {
    return {
      wallets: [],
      failedEntries: [],
    };
  }

  const rpcUrl = resolveRequiredRpcUrl(input.rpcUrl);
  const requests = input.entries.flatMap((entry) => buildWalletRpcRequests(entry));

  const { results, errors } = await withRpcRetries(
    () => postRpcBatchDetailed(rpcUrl, requests, {
      providerHint: isOfficialSolanaPublicRpcUrl(rpcUrl) ? "solana-rpc" : "helius-rpc",
      methodFamily: "wallet-batch",
      lane: input.lane,
    }),
    {
      maxAttempts: WALLET_BATCH_RETRY_MAX_ATTEMPTS,
    },
  );

  const wallets: ManagedWalletContentsWallet[] = [];
  const failedEntries: ManagedWalletLibraryEntry[] = [];
  for (const entry of input.entries) {
    const { balanceRequestId, splRequestId, token2022RequestId } = getWalletRpcRequestIds(entry);
    const walletFailed =
      errors.has(balanceRequestId)
      || errors.has(splRequestId)
      || errors.has(token2022RequestId)
      || !results.has(balanceRequestId)
      || !results.has(splRequestId)
      || !results.has(token2022RequestId);
    if (walletFailed) {
      failedEntries.push(entry);
      continue;
    }
    wallets.push(
      parseWalletRpcBatchResult({
        entry,
        rpcResults: results,
        includeZeroBalances: input.includeZeroBalances,
      }),
    );
  }

  return {
    wallets,
    failedEntries,
  };
};

const loadWalletContentsSequentiallyFromRpc = async (input: {
  rpcUrl?: string;
  entries: ManagedWalletLibraryEntry[];
  includeZeroBalances: boolean;
  lane?: RpcRequestLane;
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
  const maxAttempts = isPublicRpc ? 2 : WALLET_SEQUENTIAL_RETRY_MAX_ATTEMPTS;

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
          () => postRpcSingle(rpcUrl, request, {
            providerHint: isPublicRpc ? "solana-rpc" : "helius-rpc",
            methodFamily: request.method,
            lane: input.lane,
          }),
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

const loadWalletContentsSequentiallyFromHeliusDas = async (input: {
  rpcUrl: string;
  entries: ManagedWalletLibraryEntry[];
  includeZeroBalances: boolean;
  lane?: RpcRequestLane;
}): Promise<ManagedWalletContentsLoadOutcome> => {
  if (input.entries.length === 0) {
    return {
      wallets: [],
      walletErrors: [],
      usedSequentialFallback: false,
    };
  }

  const wallets: ManagedWalletContentsWallet[] = [];
  const walletErrors: ManagedWalletContentsWalletError[] = [];

  for (const [walletIndex, entry] of input.entries.entries()) {
    const accumulator: WalletContentsAccumulator = {
      entry,
      lamports: 0n,
      tokenBalances: [],
      assetCount: 0,
      collectibleCount: 0,
      compressedCollectibleCount: 0,
    };
    let page = 1;
    let walletFailed = false;

    while (!walletFailed) {
      const request: JsonRpcBatchRequest = {
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
      };

      try {
        // Helius DAS inventory reads are kept fully serialized per wallet/page to avoid request bursts.
        // eslint-disable-next-line no-await-in-loop
        const pageResult = await withRpcRetries(
          () =>
            postRpcSingle(input.rpcUrl, request, {
              providerHint: "helius-das",
              methodFamily: request.method,
              lane: input.lane,
            }),
          {
            maxAttempts: HELIUS_DAS_RETRY_MAX_ATTEMPTS,
          },
        );
        const { hasMorePages } = mergeHeliusDasPage(accumulator, pageResult, page);
        if (!hasMorePages) {
          break;
        }
        page += 1;
        // Keep page traversal slow and predictable so large wallets do not spike DAS limits.
        // eslint-disable-next-line no-await-in-loop
        await sleep(HELIUS_DAS_INTER_PAGE_DELAY_MS);
      } catch (error) {
        if (!isRetryableRpcError(error)) {
          throw error;
        }
        walletErrors.push(toWalletReadError(entry, error));
        walletFailed = true;
      }
    }

    if (!walletFailed) {
      const tokenBalances = aggregateTokenBalances(accumulator.tokenBalances, input.includeZeroBalances);
      wallets.push(
        buildWalletResult({
          entry,
          lamports: accumulator.lamports,
          tokenBalances,
          assetCount: accumulator.assetCount,
          collectibleCount: accumulator.collectibleCount,
          compressedCollectibleCount: accumulator.compressedCollectibleCount,
        }),
      );
    }

    if (walletIndex < input.entries.length - 1) {
      // Leave a short gap between wallets so one broad inventory read does not hammer the provider.
      // eslint-disable-next-line no-await-in-loop
      await sleep(HELIUS_DAS_INTER_WALLET_DELAY_MS);
    }
  }

  return {
    wallets,
    walletErrors,
    usedSequentialFallback: false,
  };
};

const filterWalletEntries = (
  entries: ManagedWalletLibraryEntry[],
  input: GetManagedWalletContentsInput,
): ManagedWalletLibraryEntry[] => {
  const requestedNames = input.walletNames && input.walletNames.length > 0 ? new Set(input.walletNames) : null;
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
  const filteredEntries = filterWalletEntries(entries, input);
  const hasLegacyFilters = Boolean(input.walletGroup) || Boolean(input.walletNames?.length);

  try {
    const selectedEntries = await resolveManagedWalletEntriesBySelection(input);
    if (!selectedEntries) {
      return filteredEntries;
    }

    const selectedWalletIds = new Set(selectedEntries.map((entry) => entry.walletId));
    const narrowedEntries = entries
      .filter((entry) => selectedWalletIds.has(entry.walletId))
      .toSorted((left, right) =>
        `${left.walletGroup}.${left.walletName}`.localeCompare(`${right.walletGroup}.${right.walletName}`));

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
  lane?: RpcRequestLane;
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
  const cachedWallets = new Map<string, ManagedWalletContentsWallet>();
  const uncachedEntries: ManagedWalletLibraryEntry[] = [];
  for (const entry of input.entries) {
    const cachedWallet = getCachedWalletBalance({
      rpcUrl,
      walletAddress: entry.address,
      includeZeroBalances: input.includeZeroBalances,
    });
    if (cachedWallet) {
      cachedWallets.set(entry.walletId, cachedWallet);
      continue;
    }
    uncachedEntries.push(entry);
  }

  const entryChunks = chunkEntries(uncachedEntries, walletBatchLimit);
  const fetchedWallets = new Map<string, ManagedWalletContentsWallet>();
  const walletErrors: ManagedWalletContentsWalletError[] = [];
  let usedSequentialFallback = false;

  // Process chunks in order so retry fallback behavior stays predictable per batch.
  for (const entryChunk of entryChunks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const chunkWallets = await loadWalletContentsBatchFromRpc({
        entries: entryChunk,
        rpcUrl,
        includeZeroBalances: input.includeZeroBalances,
        lane: input.lane,
      });
      for (const wallet of chunkWallets.wallets) {
        fetchedWallets.set(wallet.walletId, wallet);
      }
      if (chunkWallets.failedEntries.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        const sequentialOutcome = await loadWalletContentsSequentiallyFromRpc({
          entries: chunkWallets.failedEntries,
          rpcUrl,
          includeZeroBalances: input.includeZeroBalances,
          lane: input.lane,
        });
        usedSequentialFallback = true;
        for (const wallet of sequentialOutcome.wallets) {
          fetchedWallets.set(wallet.walletId, wallet);
        }
        walletErrors.push(...sequentialOutcome.walletErrors);
      }
    } catch (error) {
      if (!isRetryableRpcError(error) && !isBatchUnsupportedRpcError(error)) {
        throw error;
      }

      // eslint-disable-next-line no-await-in-loop
      const sequentialOutcome = await loadWalletContentsSequentiallyFromRpc({
        entries: entryChunk,
        rpcUrl,
        includeZeroBalances: input.includeZeroBalances,
        lane: input.lane,
      });
      usedSequentialFallback = true;
      for (const wallet of sequentialOutcome.wallets) {
        fetchedWallets.set(wallet.walletId, wallet);
      }
      walletErrors.push(...sequentialOutcome.walletErrors);
    }
  }

  for (const wallet of fetchedWallets.values()) {
    setCachedWalletBalance({
      rpcUrl,
      walletAddress: wallet.address,
      includeZeroBalances: input.includeZeroBalances,
      wallet,
    });
  }

  const wallets = input.entries
    .map((entry) => fetchedWallets.get(entry.walletId) ?? cachedWallets.get(entry.walletId))
    .filter((wallet): wallet is ManagedWalletContentsWallet => wallet !== undefined)
    .map(cloneWalletContentsWallet);

  return {
    wallets,
    walletErrors,
    usedSequentialFallback,
  };
};

const buildManagedWalletContentsPayload = (input: {
  instanceId: string;
  walletLibraryFilePath: string;
  invalidLibraryLineCount: number;
  includeZeroBalances: boolean;
  dataSource: ManagedWalletContentsDataSource;
  loadOutcome: ManagedWalletContentsLoadOutcome;
  warnings?: WalletContentWarning[];
}): ManagedWalletContentsOutput => {
  const wallets = input.loadOutcome.wallets;
  const totalBalanceLamports = wallets.reduce((sum, wallet) => sum + BigInt(wallet.balanceLamports), 0n);
  const aggregatedTokenTotals = buildTokenTotals(wallets);

  return {
    instanceId: input.instanceId,
    snapshotAt: Date.now(),
    walletCount: wallets.length,
    discoveredVia: "wallet-library",
    walletLibraryFilePath: input.walletLibraryFilePath,
    invalidLibraryLineCount: input.invalidLibraryLineCount,
    includeZeroBalances: input.includeZeroBalances,
    dataSource: input.dataSource,
    partial: input.loadOutcome.walletErrors.length > 0,
    warnings: input.warnings ?? [],
    wallets,
    walletErrors: input.loadOutcome.walletErrors,
    totalBalanceLamports: totalBalanceLamports.toString(),
    totalBalanceSol: Number(totalBalanceLamports) / LAMPORTS_PER_SOL,
    totalCollectibleCount: wallets.reduce((sum, wallet) => sum + wallet.collectibleCount, 0),
    totalPricedTokenUsd: wallets.reduce<number | null>(
      (sum, wallet) => sumKnownNumbers(sum, wallet.pricedTokenTotalUsd),
      null,
    ),
    tokenTotals: aggregatedTokenTotals,
  };
};

const buildWalletContentWarnings = (input: {
  usedSequentialFallback: boolean;
  walletErrors: ManagedWalletContentsWalletError[];
}): WalletContentWarning[] => {
  const warnings: WalletContentWarning[] = [];
  if (input.usedSequentialFallback) {
    warnings.push({
      code: "RPC_SEQUENTIAL_FALLBACK",
      message: "Some wallet reads fell back to sequential RPC requests after batch throttling, timeout, or provider batch restrictions.",
    });
  }
  if (input.walletErrors.length > 0) {
    warnings.push({
      code: "PARTIAL_WALLET_RESULTS",
      message: `Wallet contents were only partially available for ${input.walletErrors.length} wallet${input.walletErrors.length === 1 ? "" : "s"}.`,
    });
  }
  return warnings;
};

const classifySimpleWalletContentsRead = (input: {
  ctx: ActionContext;
  walletCount: number;
  hasCustomLoader: boolean;
}): "inline" | "queued" => {
  if (input.walletCount === 0 || input.hasCustomLoader || input.ctx.jobMeta || !input.ctx.enqueueJob || !input.ctx.stateStore) {
    return "inline";
  }
  return input.walletCount > INLINE_SIMPLE_WALLET_LIMIT ? "queued" : "inline";
};

const loadPreferredRpcUrl = async (input: {
  instanceId: string;
  ctx: ActionContext;
  hasCustomLoader: boolean;
}): Promise<string | undefined> => {
  const heliusConfig = await resolveHeliusRpcConfig({
    activeInstanceId: input.instanceId,
    rpcUrl: input.ctx.rpcUrl,
  });
  return heliusConfig.rpcUrl ?? input.ctx.rpcUrl;
};

const executeWalletContentsRpcOnly = async (input: {
  ctx: ActionContext;
  actionInput: GetWalletContentsInput;
  deps: GetManagedWalletContentsDeps;
}): Promise<ReturnType<Action<GetWalletContentsInput, ManagedWalletContentsActionData>["execute"]>> => {
  const startedAt = Date.now();
  const idempotencyKey = crypto.randomUUID();
  const instanceId = resolveInstanceId(input.actionInput.instanceId);

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
    const filteredEntries = await resolveWalletEntries(
      walletLibrary.entries,
      input.actionInput as GetManagedWalletContentsInput,
    );
    const requestLane = getWalletContentsRequestLane(input.ctx);
    const requestKey = buildWalletScanRequestKey({
      instanceId,
      includeZeroBalances: input.actionInput.includeZeroBalances,
      useHeliusDas: false,
      entries: filteredEntries,
    });
    const readMode = classifySimpleWalletContentsRead({
      ctx: input.ctx,
      walletCount: filteredEntries.length,
      hasCustomLoader: Boolean(input.deps.loadWalletContents),
    });

    if (readMode === "queued") {
      const reusableJob = resolveReusableWalletScanJob(input.ctx, requestKey, WALLET_CONTENTS_SCAN_ROUTINE_NAME);
      if (reusableJob?.status === "completed" && reusableJob.job.lastResult?.ok === true && reusableJob.job.lastResult.data) {
        return {
          ok: true,
          retryable: false,
          data: reusableJob.job.lastResult.data as ManagedWalletContentsActionData,
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }
      if (reusableJob) {
        return {
          ok: true,
          retryable: false,
          data: createQueuedWalletContentsPayload(
            reusableJob.job,
            requestKey,
            `Wallet scan job #${reusableJob.job.serialNumber ?? reusableJob.job.id} is already ${reusableJob.job.status} in the background.`,
          ),
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }

      const scanJob = await input.ctx.enqueueJob?.({
        botId: requestKey,
        routineName: WALLET_CONTENTS_SCAN_ROUTINE_NAME,
        totalCycles: 1,
        config: {
          requestKey,
          summaryDepth: "full",
          input: {
            ...input.actionInput,
            instanceId,
          },
        },
      });

      if (scanJob) {
        return {
          ok: true,
          retryable: false,
          data: createQueuedWalletContentsPayload(
            scanJob,
            requestKey,
            `Queued wallet scan job #${scanJob.serialNumber ?? scanJob.id} because this wallet read is large enough to run more safely in the background.`,
          ),
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }
    }

    const preferredRpcUrl = await loadPreferredRpcUrl({
      instanceId,
      ctx: input.ctx,
      hasCustomLoader: Boolean(input.deps.loadWalletContents),
    });
    const loadOutcome = input.deps.loadWalletContents
      ? await loadWalletsWithLoader(filteredEntries, input.deps.loadWalletContents, {
          rpcUrl: preferredRpcUrl,
          includeZeroBalances: input.actionInput.includeZeroBalances,
        })
      : await loadWalletContentsFromRpc({
          entries: filteredEntries,
          rpcUrl: preferredRpcUrl,
          includeZeroBalances: input.actionInput.includeZeroBalances,
          lane: requestLane,
        });

    const wallets = loadOutcome.wallets;
    if (wallets.length === 0 && loadOutcome.walletErrors.length > 0) {
      throw new Error(loadOutcome.walletErrors[0]?.error ?? "Managed-wallet RPC reads failed.");
    }

    return {
      ok: true,
      retryable: false,
      data: buildManagedWalletContentsPayload({
        instanceId,
        walletLibraryFilePath,
        invalidLibraryLineCount: walletLibrary.invalidLineCount,
        includeZeroBalances: input.actionInput.includeZeroBalances,
        dataSource: loadOutcome.usedSequentialFallback ? "rpc-sequential" : "rpc-batch",
        loadOutcome,
        warnings: buildWalletContentWarnings({
          usedSequentialFallback: loadOutcome.usedSequentialFallback,
          walletErrors: loadOutcome.walletErrors,
        }),
      }),
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
      code: isRetryableRpcError(error) ? "GET_WALLET_CONTENTS_RATE_LIMITED" : "GET_WALLET_CONTENTS_FAILED",
      durationMs: Date.now() - startedAt,
      timestamp: Date.now(),
      idempotencyKey,
    };
  }
};

export const createGetManagedWalletContentsAction = (
  deps: GetManagedWalletContentsDeps = {},
): Action<GetManagedWalletContentsInput, ManagedWalletContentsActionData> => {
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

        const entries = walletLibrary.entries;

        const filteredEntries = await resolveWalletEntries(entries, input);
        const heliusConfig = await resolveHeliusRpcConfig({
          activeInstanceId: instanceId,
          rpcUrl: ctx.rpcUrl,
          requireSelectedProvider: true,
        });

        const useHeliusDas = Boolean(heliusConfig?.rpcUrl);
        const requestLane = getWalletContentsRequestLane(ctx);
        const requestKey = buildWalletScanRequestKey({
          instanceId,
          includeZeroBalances: input.includeZeroBalances,
          useHeliusDas,
          entries: filteredEntries,
        });
        const readMode = classifyWalletContentsRead({
          ctx,
          walletCount: filteredEntries.length,
          useHeliusDas,
          hasCustomLoader: Boolean(deps.loadWalletContents),
        });

        if (readMode === "queued") {
          const reusableJob = resolveReusableWalletScanJob(ctx, requestKey);
          if (reusableJob?.status === "completed" && reusableJob.job.lastResult?.ok === true && reusableJob.job.lastResult.data) {
            return {
              ok: true,
              retryable: false,
              data: reusableJob.job.lastResult.data as ManagedWalletContentsActionData,
              durationMs: Date.now() - startedAt,
              timestamp: Date.now(),
              idempotencyKey,
            };
          }
          if (reusableJob) {
            return {
              ok: true,
              retryable: false,
              data: createQueuedWalletContentsPayload(
                reusableJob.job,
                requestKey,
                `Wallet scan job #${reusableJob.job.serialNumber ?? reusableJob.job.id} is already ${reusableJob.job.status} in the background.`,
              ),
              durationMs: Date.now() - startedAt,
              timestamp: Date.now(),
              idempotencyKey,
            };
          }

          const scanJob = await ctx.enqueueJob?.({
            botId: requestKey,
            routineName: WALLET_INVENTORY_SCAN_ROUTINE_NAME,
            totalCycles: 1,
            config: {
              requestKey,
              summaryDepth: "full",
              input: {
                ...input,
                instanceId,
              },
            },
          });

          if (scanJob) {
            return {
              ok: true,
              retryable: false,
              data: createQueuedWalletContentsPayload(
                scanJob,
                requestKey,
                `Queued wallet scan job #${scanJob.serialNumber ?? scanJob.id} because this inventory read is large enough to run more safely in the background.`,
              ),
              durationMs: Date.now() - startedAt,
              timestamp: Date.now(),
              idempotencyKey,
            };
          }
        }

        let dataSource: ManagedWalletContentsDataSource = "rpc-batch";
        let fellBackFromHeliusDas = false;
        let loadOutcome = deps.loadWalletContents
          ? await loadWalletsWithLoader(filteredEntries, deps.loadWalletContents, {
              rpcUrl: ctx.rpcUrl,
              includeZeroBalances: input.includeZeroBalances,
            })
          : useHeliusDas && heliusConfig?.rpcUrl
            ? await loadWalletContentsSequentiallyFromHeliusDas({
                entries: filteredEntries,
                rpcUrl: heliusConfig.rpcUrl,
                includeZeroBalances: input.includeZeroBalances,
                lane: requestLane,
              })
            : await loadWalletContentsFromRpc({
                entries: filteredEntries,
                rpcUrl: ctx.rpcUrl,
                includeZeroBalances: input.includeZeroBalances,
                lane: requestLane,
              });
        if (useHeliusDas && heliusConfig?.rpcUrl && loadOutcome.wallets.length === 0 && loadOutcome.walletErrors.length > 0) {
          fellBackFromHeliusDas = true;
          loadOutcome = await loadWalletContentsFromRpc({
            entries: filteredEntries,
            rpcUrl: heliusConfig.rpcUrl,
            includeZeroBalances: input.includeZeroBalances,
            lane: requestLane,
          });
        }
        if (useHeliusDas) {
          dataSource = fellBackFromHeliusDas
            ? (loadOutcome.usedSequentialFallback ? "rpc-sequential" : "rpc-batch")
            : "helius-das";
        } else if (loadOutcome.usedSequentialFallback) {
          dataSource = "rpc-sequential";
        }

        const wallets = loadOutcome.wallets;
        if (wallets.length === 0 && loadOutcome.walletErrors.length > 0) {
          throw new Error(loadOutcome.walletErrors[0]?.error ?? "Managed-wallet RPC reads failed.");
        }

        return {
          ok: true,
          retryable: false,
          data: buildManagedWalletContentsPayload({
            instanceId,
            walletLibraryFilePath,
            invalidLibraryLineCount: walletLibrary.invalidLineCount,
            includeZeroBalances: input.includeZeroBalances,
            dataSource,
            loadOutcome,
          }),
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

export const createGetWalletContentsAction = (
  deps: GetManagedWalletContentsDeps = {},
): Action<GetWalletContentsInput, ManagedWalletContentsActionData> => {
  return {
    name: "getWalletContents",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: getWalletContentsInputSchema,
    async execute(ctx, input) {
      return await executeWalletContentsRpcOnly({
        ctx,
        actionInput: input,
        deps,
      });
    },
  };
};

export const getWalletContentsAction = createGetWalletContentsAction();

export const resetWalletContentsCachesForTests = (): void => {
  walletBalanceCache.clear();
};
