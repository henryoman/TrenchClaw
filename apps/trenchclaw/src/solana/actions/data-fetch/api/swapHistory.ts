import { z } from "zod";
import { createHelius } from "helius-sdk";

import type { Action } from "../../../../ai/contracts/types/action";
import { resolveHeliusRpcConfig } from "../../../lib/rpc/helius";

const HELIUS_SWAP_HISTORY_LIMIT = 20;
const HELIUS_CONTINUATION_RETRY_LIMIT = 10;
const HELIUS_CONTINUATION_SIGNATURE_REGEX = /before(?:-signature|Signature)\s*(?:parameter)?\s*(?:set to)?\s*([1-9A-HJ-NP-Za-km-z]{32,})/i;

const base58AddressSchema = z.string().trim().min(32).max(44).regex(/^[1-9A-HJ-NP-Za-km-z]+$/);

const swapHistoryInputSchema = z.object({
  walletAddress: base58AddressSchema,
  limit: z.number().int().positive().max(HELIUS_SWAP_HISTORY_LIMIT).default(HELIUS_SWAP_HISTORY_LIMIT),
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
      tokenAmount: string | null;
      decimals: number | null;
    }>;
    tokenOutputs: Array<{
      userAccount: string | null;
      mint: string | null;
      tokenAmount: string | null;
      decimals: number | null;
    }>;
  } | null;
}

interface SwapHistoryOutput {
  walletAddress: string;
  limit: number;
  backendTimezone: "UTC";
  displayTimezone: "America/Los_Angeles";
  returned: number;
  swaps: SwapHistoryItem[];
}

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

const mapSwapTokenSide = (entries: HeliusSwapEvent["tokenInputs"] | HeliusSwapEvent["tokenOutputs"] | undefined) =>
  (entries ?? []).map((entry) => ({
    userAccount: entry.userAccount ?? null,
    mint: entry.mint ?? null,
    tokenAmount: entry.rawTokenAmount?.tokenAmount ?? null,
    decimals: typeof entry.rawTokenAmount?.decimals === "number" ? entry.rawTokenAmount.decimals : null,
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
    description: transaction.description ?? null,
    source: transaction.source ?? null,
    type: transaction.type ?? "SWAP",
    feeLamports: typeof transaction.fee === "number" ? transaction.fee : null,
    ...formatted,
    tokenTransfers: (transaction.tokenTransfers ?? []).map(mapTransfer),
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
  const transactions = await fetchRecentSwapTransactions(input);
  const swaps = transactions.slice(0, input.limit).map(mapTransaction);

  return {
    walletAddress: input.walletAddress,
    limit: input.limit,
    backendTimezone: "UTC",
    displayTimezone: "America/Los_Angeles",
    returned: swaps.length,
    swaps,
  };
};

export const getSwapHistoryAction: Action<SwapHistoryInput, SwapHistoryOutput> = {
  name: "getSwapHistory",
  category: "data-based",
  inputSchema: swapHistoryInputSchema,
  async execute(_ctx, rawInput) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const data = await getSwapHistory(rawInput);
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
        retryable: false,
        error: message,
        code: "SWAP_HISTORY_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
