import { z } from "zod";
import { createHelius } from "helius-sdk";

import type { Action } from "../../ai/contracts/types/action";
import { resolveHeliusRpcConfig } from "../../solana/lib/rpc/helius";

const DEFAULT_HELIUS_SWAP_HISTORY_LIMIT = 10;
const MAX_HELIUS_SWAP_HISTORY_LIMIT = 20;
const HELIUS_CONTINUATION_RETRY_LIMIT = 10;
const HELIUS_CONTINUATION_SIGNATURE_REGEX = /before(?:-signature|Signature)\s*(?:parameter)?\s*(?:set to)?\s*([1-9A-HJ-NP-Za-km-z]{32,})/i;

const base58AddressSchema = z.string().trim().min(32).max(44).regex(/^[1-9A-HJ-NP-Za-km-z]+$/);

const swapHistoryInputSchema = z.object({
  walletAddress: base58AddressSchema,
  limit: z.number().int().positive().max(MAX_HELIUS_SWAP_HISTORY_LIMIT).default(DEFAULT_HELIUS_SWAP_HISTORY_LIMIT),
});

type SwapHistoryInput = z.output<typeof swapHistoryInputSchema>;

interface HeliusTokenTransfer {
  mint?: string;
  tokenAmount?: number;
  tokenStandard?: string;
  fromTokenAccount?: string;
  toTokenAccount?: string;
}

interface HeliusSwapEvent {
  nativeInput?: {
    amount?: string;
    account?: string;
    mint?: string;
  };
  nativeOutput?: {
    amount?: string;
    account?: string;
    mint?: string;
  };
  tokenInputs?: Array<{
    userAccount?: string;
    mint?: string;
    rawTokenAmount?: {
      tokenAmount?: string;
      decimals?: number;
    };
  }>;
  tokenOutputs?: Array<{
    userAccount?: string;
    mint?: string;
    rawTokenAmount?: {
      tokenAmount?: string;
      decimals?: number;
    };
  }>;
}

interface HeliusEnhancedTransaction {
  signature: string;
  description?: string;
  type?: string;
  source?: string;
  fee?: number;
  timestamp?: number;
  tokenTransfers?: HeliusTokenTransfer[];
  events?: {
    swap?: HeliusSwapEvent;
  };
}

interface SwapHistoryItem {
  signature: string;
  description: string | null;
  source: string | null;
  type: string;
  feeLamports: number | null;
  timestampUnixSecondsUtc: number | null;
  timestampUtcIso: string | null;
  datePacific: string | null;
  timePacific: string | null;
  dateTimePacific: string | null;
  tokenTransfers: Array<{
    mint: string | null;
    tokenAmount: number | null;
    tokenStandard: string | null;
  }>;
  tokenTransferSummaryByMint: Array<{
    mint: string | null;
    tokenStandard: string | null;
    totalTokenAmount: number | null;
    transferCount: number;
  }>;
  swap: {
    nativeInput: {
      amount: string | null;
      account: string | null;
      mint: string | null;
    } | null;
    nativeOutput: {
      amount: string | null;
      account: string | null;
      mint: string | null;
    } | null;
    tokenInputs: Array<{
      userAccount: string | null;
      mint: string | null;
      tokenAmountRaw: string | null;
      decimals: number | null;
      tokenAmountUiString: string | null;
    }>;
    tokenOutputs: Array<{
      userAccount: string | null;
      mint: string | null;
      tokenAmountRaw: string | null;
      decimals: number | null;
      tokenAmountUiString: string | null;
    }>;
  } | null;
}

interface SwapHistoryOutput {
  walletAddress: string;
  limit: number;
  backendTimezone: "UTC";
  displayTimezone: "America/Los_Angeles";
  returned: number;
  sources: Array<{ source: string | null; count: number }>;
  structuredSwapCount: number;
  swaps: SwapHistoryItem[];
}

const trimToNull = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isNotFoundSwapHistoryError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /\b404\b/u.test(message) && /not found/iu.test(message);
};

const isRetryableSwapHistoryError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b/u.test(message)
    || /\b403\b/u.test(message)
    || /rate limit/iu.test(message)
    || /too many requests/iu.test(message)
    || /temporarily unavailable/iu.test(message)
    || /timed out/iu.test(message)
    || /\btimeout\b/iu.test(message)
    || /\b503\b/u.test(message)
    || /\b504\b/u.test(message)
    || /overload(?:ed)?/iu.test(message)
    || /please try again/iu.test(message)
    || /\babort(?:ed)?\b/iu.test(message);
};

const formatUiAmountString = (amountRaw: string | undefined, decimals: number | undefined): string | null => {
  if (!amountRaw || typeof decimals !== "number" || !Number.isInteger(decimals) || decimals < 0) {
    return null;
  }
  try {
    const raw = BigInt(amountRaw);
    if (decimals === 0) {
      return raw.toString();
    }
    const divisor = 10n ** BigInt(decimals);
    const whole = raw / divisor;
    const fraction = (raw % divisor).toString().padStart(decimals, "0").replace(/0+$/u, "");
    return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
  } catch {
    return null;
  }
};

const pacificDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const pacificTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const pacificDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

const resolveHeliusApiKey = async (): Promise<string> => {
  const { apiKey } = await resolveHeliusRpcConfig();
  if (apiKey) {
    return apiKey;
  }

  throw new Error(
    "Missing Helius API key. Configure a Helius private RPC credential or populate rpc.helius.api-key in the vault.",
  );
};

const extractContinuationSignature = (message: string): string | null => {
  const match = message.match(HELIUS_CONTINUATION_SIGNATURE_REGEX);
  return match?.[1] ?? null;
};

const mapTransfer = (transfer: HeliusTokenTransfer) => ({
  mint: transfer.mint ?? null,
  tokenAmount: typeof transfer.tokenAmount === "number" ? transfer.tokenAmount : null,
  tokenStandard: transfer.tokenStandard ?? null,
});

const summarizeTransfersByMint = (transfers: HeliusTokenTransfer[]): SwapHistoryItem["tokenTransferSummaryByMint"] => {
  const grouped = new Map<string, {
    mint: string | null;
    tokenStandard: string | null;
    totalTokenAmount: number | null;
    transferCount: number;
  }>();

  for (const transfer of transfers) {
    const mint = trimToNull(transfer.mint);
    const tokenStandard = trimToNull(transfer.tokenStandard);
    const key = `${mint ?? "unknown"}:${tokenStandard ?? "unknown"}`;
    const existing = grouped.get(key);
    const tokenAmount = typeof transfer.tokenAmount === "number" ? transfer.tokenAmount : null;
    if (existing) {
      existing.transferCount += 1;
      existing.totalTokenAmount =
        existing.totalTokenAmount !== null && tokenAmount !== null
          ? existing.totalTokenAmount + tokenAmount
          : existing.totalTokenAmount ?? tokenAmount;
      continue;
    }
    grouped.set(key, {
      mint,
      tokenStandard,
      totalTokenAmount: tokenAmount,
      transferCount: 1,
    });
  }

  return Array.from(grouped.values()).toSorted((left, right) => right.transferCount - left.transferCount);
};

const mapSwapTokenSide = (entries: HeliusSwapEvent["tokenInputs"] | HeliusSwapEvent["tokenOutputs"] | undefined) =>
  (entries ?? []).map((entry) => ({
    userAccount: entry.userAccount ?? null,
    mint: entry.mint ?? null,
    tokenAmountRaw: entry.rawTokenAmount?.tokenAmount ?? null,
    decimals: typeof entry.rawTokenAmount?.decimals === "number" ? entry.rawTokenAmount.decimals : null,
    tokenAmountUiString: formatUiAmountString(entry.rawTokenAmount?.tokenAmount, entry.rawTokenAmount?.decimals),
  }));

const mapSwapEvent = (event: HeliusSwapEvent | undefined): SwapHistoryItem["swap"] => {
  if (!event) {
    return null;
  }

  return {
    nativeInput: event.nativeInput
      ? {
          amount: event.nativeInput.amount ?? null,
          account: event.nativeInput.account ?? null,
          mint: event.nativeInput.mint ?? null,
        }
      : null,
    nativeOutput: event.nativeOutput
      ? {
          amount: event.nativeOutput.amount ?? null,
          account: event.nativeOutput.account ?? null,
          mint: event.nativeOutput.mint ?? null,
        }
      : null,
    tokenInputs: mapSwapTokenSide(event.tokenInputs),
    tokenOutputs: mapSwapTokenSide(event.tokenOutputs),
  };
};

const formatTimestamp = (timestampUnixSeconds: number | undefined) => {
  if (typeof timestampUnixSeconds !== "number" || !Number.isFinite(timestampUnixSeconds) || timestampUnixSeconds <= 0) {
    return {
      timestampUnixSecondsUtc: null,
      timestampUtcIso: null,
      datePacific: null,
      timePacific: null,
      dateTimePacific: null,
    };
  }

  const date = new Date(timestampUnixSeconds * 1000);
  return {
    timestampUnixSecondsUtc: timestampUnixSeconds,
    timestampUtcIso: date.toISOString(),
    datePacific: pacificDateFormatter.format(date),
    timePacific: pacificTimeFormatter.format(date),
    dateTimePacific: pacificDateTimeFormatter.format(date),
  };
};

const mapTransaction = (transaction: HeliusEnhancedTransaction): SwapHistoryItem => {
  const formatted = formatTimestamp(transaction.timestamp);

  return {
    signature: transaction.signature,
    description: trimToNull(transaction.description),
    source: trimToNull(transaction.source),
    type: transaction.type ?? "SWAP",
    feeLamports: typeof transaction.fee === "number" ? transaction.fee : null,
    ...formatted,
    tokenTransfers: (transaction.tokenTransfers ?? []).map(mapTransfer),
    tokenTransferSummaryByMint: summarizeTransfersByMint(transaction.tokenTransfers ?? []),
    swap: mapSwapEvent(transaction.events?.swap),
  };
};

const fetchRecentSwapTransactions = async (
  input: SwapHistoryInput,
  beforeSignature?: string,
  continuationRetries = 0,
): Promise<HeliusEnhancedTransaction[]> => {
  const apiKey = await resolveHeliusApiKey();
  const helius = createHelius({ apiKey });

  try {
    const transactions = await helius.enhanced.getTransactionsByAddress({
      address: input.walletAddress,
      limit: input.limit,
      sortOrder: "desc",
      type: "SWAP",
      ...(beforeSignature ? { beforeSignature } : {}),
    });
    return transactions as HeliusEnhancedTransaction[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const continuationSignature = extractContinuationSignature(message);
    if (!continuationSignature) {
      throw error;
    }
    if (continuationRetries >= HELIUS_CONTINUATION_RETRY_LIMIT) {
      throw new Error(`Unable to resolve recent swap history after ${HELIUS_CONTINUATION_RETRY_LIMIT} continuation retries.`, { cause: error });
    }

    return fetchRecentSwapTransactions(input, continuationSignature, continuationRetries + 1);
  }
};

export const getSwapHistory = async (rawInput: SwapHistoryInput): Promise<SwapHistoryOutput> => {
  const input = swapHistoryInputSchema.parse(rawInput);
  const transactions = await (async (): Promise<HeliusEnhancedTransaction[]> => {
    try {
      return await fetchRecentSwapTransactions(input);
    } catch (error) {
      if (isNotFoundSwapHistoryError(error)) {
        return [];
      }
      throw error;
    }
  })();
  const swaps = transactions.slice(0, input.limit).map(mapTransaction);

  return {
    walletAddress: input.walletAddress,
    limit: input.limit,
    backendTimezone: "UTC",
    displayTimezone: "America/Los_Angeles",
    returned: swaps.length,
    sources: Array.from(
      swaps.reduce((counts, swap) => {
        const key = swap.source ?? "__null__";
        counts.set(key, {
          source: swap.source,
          count: (counts.get(key)?.count ?? 0) + 1,
        });
        return counts;
      }, new Map<string, { source: string | null; count: number }>()),
    ).map(([, value]) => value).toSorted((left, right) => right.count - left.count),
    structuredSwapCount: swaps.filter((swap) => swap.swap !== null).length,
    swaps,
  };
};

export const createGetSwapHistoryAction = (
  deps: {
    loadSwapHistory?: (input: SwapHistoryInput) => Promise<SwapHistoryOutput>;
  } = {},
): Action<SwapHistoryInput, SwapHistoryOutput> => {
  const loadSwapHistory = deps.loadSwapHistory ?? getSwapHistory;

  return {
    name: "getSwapHistory",
    category: "data-based",
    inputSchema: swapHistoryInputSchema,
    async execute(_ctx, rawInput) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();

      try {
        const data = await loadSwapHistory(rawInput);
        return {
          ok: true,
          retryable: false,
          data,
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          retryable: isRetryableSwapHistoryError(error),
          error: message,
          code: isRetryableSwapHistoryError(error) ? "SWAP_HISTORY_RATE_LIMITED" : "SWAP_HISTORY_FAILED",
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }
    },
  };
};

export const getSwapHistoryAction = createGetSwapHistoryAction();
