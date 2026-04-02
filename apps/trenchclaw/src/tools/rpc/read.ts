import { z } from "zod";

import type { Action } from "../../ai/contracts/types/action";
import { getAccountInfo, type AccountInfoEncoding } from "../../solana/lib/rpc/getAccountInfo";
import { getBalance } from "../../solana/lib/rpc/getBalance";
import { getMultipleAccounts, type MultipleAccountsEncoding } from "../../solana/lib/rpc/getMultipleAccounts";
import { getSignaturesForAddress } from "../../solana/lib/rpc/getSignaturesForAddress";
import { getTokenAccountsByOwner, type TokenAccountsByOwnerEncoding } from "../../solana/lib/rpc/getTokenAccountsByOwner";
import { getTokenLargestAccounts } from "../../solana/lib/rpc/getTokenLargestAccounts";
import { getTokenSupply } from "../../solana/lib/rpc/getTokenSupply";
import { getTransaction, type TransactionEncoding } from "../../solana/lib/rpc/getTransaction";

const MAX_MULTIPLE_ACCOUNT_INPUTS = 200;
const MAX_SIGNATURE_LIMIT = 100;
const MAX_TOKEN_ACCOUNT_RESULTS = 200;
const MAX_TOKEN_LARGEST_ACCOUNT_RESULTS = 20;
const base58AddressSchema = z.string().trim().min(32).max(44).regex(/^[1-9A-HJ-NP-Za-km-z]+$/u);
const signatureSchema = z.string().trim().min(32).max(128);
const commitmentSchema = z.enum(["processed", "confirmed", "finalized"]);
const accountInfoEncodingSchema = z.enum(["base64", "jsonParsed"]) satisfies z.ZodType<AccountInfoEncoding>;
const multipleAccountsEncodingSchema = z.enum(["base64", "jsonParsed"]) satisfies z.ZodType<MultipleAccountsEncoding>;
const tokenAccountsEncodingSchema = z.enum(["base64", "jsonParsed"]) satisfies z.ZodType<TokenAccountsByOwnerEncoding>;
const transactionEncodingSchema = z.enum(["base64", "jsonParsed"]) satisfies z.ZodType<TransactionEncoding>;
const dataSliceSchema = z.object({
  offset: z.number().int().min(0),
  length: z.number().int().min(0),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const toStringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const toBooleanOrNull = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const toFiniteNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const toIntegerOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) ? value : null;

const toBigIntOrNull = (value: unknown): bigint | null => {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
};

const formatUiAmountStringFromRaw = (amountRaw: bigint, decimals: number): string => {
  if (decimals <= 0) {
    return amountRaw.toString();
  }

  const isNegative = amountRaw < 0n;
  const normalized = isNegative ? -amountRaw : amountRaw;
  const scale = 10n ** BigInt(decimals);
  const whole = normalized / scale;
  const fraction = normalized % scale;
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/u, "");
  const prefix = isNegative ? "-" : "";
  return fractionText.length > 0 ? `${prefix}${whole.toString()}.${fractionText}` : `${prefix}${whole.toString()}`;
};

const summarizeTokenAmount = (value: unknown): {
  amountRaw: string | null;
  decimals: number | null;
  uiAmount: number | null;
  uiAmountString: string | null;
} | null => {
  if (!isRecord(value)) {
    return null;
  }

  const amountRaw = toBigIntOrNull(value.amount);
  const decimals = toIntegerOrNull(value.decimals);
  const uiAmountString = toStringOrNull(value.uiAmountString)
    ?? (typeof value.uiAmount === "number" && Number.isFinite(value.uiAmount) ? String(value.uiAmount) : null);
  const uiAmount =
    toFiniteNumberOrNull(value.uiAmount)
    ?? (uiAmountString ? Number(uiAmountString) : null);

  return {
    amountRaw: amountRaw?.toString() ?? null,
    decimals,
    uiAmount: uiAmount !== null && Number.isFinite(uiAmount) ? uiAmount : null,
    uiAmountString,
  };
};

const summarizeParsedTokenAccount = (
  account: unknown,
  fallbackAddress?: string,
): {
  address: string | null;
  ownerProgramId: string | null;
  mintAddress: string | null;
  ownerAddress: string | null;
  state: string | null;
  isNative: boolean | null;
  tokenAmountRaw: string | null;
  tokenAmountUi: number | null;
  tokenAmountUiString: string | null;
  decimals: number | null;
} | null => {
  const entry = isRecord(account) ? account : null;
  const address = toStringOrNull(entry?.pubkey) ?? toStringOrNull(entry?.address) ?? fallbackAddress ?? null;
  const innerAccount =
    entry && "account" in entry
      ? (isRecord(entry.account) ? entry.account : null)
      : entry;
  if (!isRecord(innerAccount)) {
    return null;
  }

  const data = isRecord(innerAccount.data) ? innerAccount.data : null;
  const parsed = isRecord(data?.parsed) ? data.parsed : null;
  const info = isRecord(parsed?.info) ? parsed.info : null;
  if (!info) {
    return null;
  }

  const tokenAmount = summarizeTokenAmount(info.tokenAmount);
  const mintAddress = toStringOrNull(info.mint);
  const ownerAddress = toStringOrNull(info.owner);
  const hasTokenShape = mintAddress !== null || ownerAddress !== null || tokenAmount !== null;
  if (!hasTokenShape) {
    return null;
  }

  return {
    address,
    ownerProgramId: toStringOrNull(innerAccount.owner),
    mintAddress,
    ownerAddress,
    state: toStringOrNull(info.state),
    isNative: toBooleanOrNull(info.isNative),
    tokenAmountRaw: tokenAmount?.amountRaw ?? null,
    tokenAmountUi: tokenAmount?.uiAmount ?? null,
    tokenAmountUiString: tokenAmount?.uiAmountString ?? null,
    decimals: tokenAmount?.decimals ?? null,
  };
};

const summarizeParsedTokenMint = (account: unknown): {
  ownerProgramId: string | null;
  decimals: number | null;
  supplyRaw: string | null;
  supplyUiString: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  isInitialized: boolean | null;
} | null => {
  const entry = isRecord(account) ? account : null;
  const innerAccount =
    entry && "account" in entry
      ? (isRecord(entry.account) ? entry.account : null)
      : entry;
  if (!isRecord(innerAccount)) {
    return null;
  }

  const data = isRecord(innerAccount.data) ? innerAccount.data : null;
  const parsed = isRecord(data?.parsed) ? data.parsed : null;
  const info = isRecord(parsed?.info) ? parsed.info : null;
  const parsedType = toStringOrNull(parsed?.type);
  if (parsedType !== "mint" || !info) {
    return null;
  }

  const decimals = toIntegerOrNull(info.decimals);
  const supplyRaw = toBigIntOrNull(info.supply);
  return {
    ownerProgramId: toStringOrNull(innerAccount.owner),
    decimals,
    supplyRaw: supplyRaw?.toString() ?? null,
    supplyUiString: supplyRaw !== null && decimals !== null ? formatUiAmountStringFromRaw(supplyRaw, decimals) : null,
    mintAuthority: toStringOrNull(info.mintAuthority),
    freezeAuthority: toStringOrNull(info.freezeAuthority),
    isInitialized: toBooleanOrNull(info.isInitialized),
  };
};

const summarizeAccountInfo = (
  account: unknown,
  fallbackAddress?: string,
): {
  address: string | null;
  ownerProgramId: string | null;
  lamports: string | null;
  executable: boolean | null;
  space: number | null;
  parsedType: string | null;
  parsedTokenAccount: ReturnType<typeof summarizeParsedTokenAccount>;
  parsedTokenMint: ReturnType<typeof summarizeParsedTokenMint>;
} | null => {
  const entry = isRecord(account) ? account : null;
  const address = toStringOrNull(entry?.pubkey) ?? toStringOrNull(entry?.address) ?? fallbackAddress ?? null;
  const innerAccount =
    entry && "account" in entry
      ? (isRecord(entry.account) ? entry.account : null)
      : entry;
  if (!isRecord(innerAccount)) {
    return null;
  }

  const data = isRecord(innerAccount.data) ? innerAccount.data : null;
  const parsed = isRecord(data?.parsed) ? data.parsed : null;
  return {
    address,
    ownerProgramId: toStringOrNull(innerAccount.owner),
    lamports: toBigIntOrNull(innerAccount.lamports)?.toString() ?? null,
    executable: toBooleanOrNull(innerAccount.executable),
    space: toIntegerOrNull(innerAccount.space),
    parsedType: toStringOrNull(parsed?.type),
    parsedTokenAccount: summarizeParsedTokenAccount(account, fallbackAddress),
    parsedTokenMint: summarizeParsedTokenMint(account),
  };
};

const summarizeParsedTokenAccounts = (
  accounts: Array<{ address: string; account: unknown | null }>,
): {
  parsedTokenAccounts: Array<NonNullable<ReturnType<typeof summarizeParsedTokenAccount>>>;
  totalsByMint: Array<{
    mintAddress: string;
    decimals: number | null;
    accountCount: number;
    totalAmountRaw: string;
    totalAmountUiString: string | null;
  }>;
} => {
  const parsedTokenAccounts = accounts
    .map((entry) => summarizeParsedTokenAccount(entry, entry.address))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const totals = new Map<string, { mintAddress: string; decimals: number | null; accountCount: number; totalAmountRaw: bigint }>();
  for (const entry of parsedTokenAccounts) {
    const mintAddress = entry.mintAddress;
    const amountRaw = toBigIntOrNull(entry.tokenAmountRaw);
    if (!mintAddress || amountRaw === null) {
      continue;
    }
    const key = `${mintAddress}:${entry.decimals ?? "unknown"}`;
    const existing = totals.get(key);
    if (existing) {
      existing.accountCount += 1;
      existing.totalAmountRaw += amountRaw;
      continue;
    }
    totals.set(key, {
      mintAddress,
      decimals: entry.decimals,
      accountCount: 1,
      totalAmountRaw: amountRaw,
    });
  }

  return {
    parsedTokenAccounts,
    totalsByMint: Array.from(totals.values()).map((entry) => ({
      mintAddress: entry.mintAddress,
      decimals: entry.decimals,
      accountCount: entry.accountCount,
      totalAmountRaw: entry.totalAmountRaw.toString(),
      totalAmountUiString:
        entry.decimals !== null ? formatUiAmountStringFromRaw(entry.totalAmountRaw, entry.decimals) : null,
    })),
  };
};

const isRetryableRpcError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b/u.test(message)
    || /\b403\b/u.test(message)
    || /rate limit/iu.test(message)
    || /too many requests/iu.test(message)
    || /overload(?:ed)?/iu.test(message)
    || /please try again/iu.test(message)
    || /\b503\b/u.test(message)
    || /\b504\b/u.test(message)
    || /temporarily unavailable/iu.test(message)
    || /timed out/iu.test(message)
    || /\btimeout\b/iu.test(message)
    || /\babort(?:ed)?\b/iu.test(message);
};

const createFailure = (input: { error: unknown; code: string; startedAt: number; idempotencyKey: string }) => ({
  ok: false as const,
  retryable: isRetryableRpcError(input.error),
  error: input.error instanceof Error ? input.error.message : String(input.error),
  code: isRetryableRpcError(input.error) ? `${input.code}_RATE_LIMITED` : `${input.code}_FAILED`,
  durationMs: Date.now() - input.startedAt,
  timestamp: Date.now(),
  idempotencyKey: input.idempotencyKey,
});

const createSuccess = <T>(input: { data: T; startedAt: number; idempotencyKey: string }) => ({
  ok: true as const,
  retryable: false,
  data: input.data,
  durationMs: Date.now() - input.startedAt,
  timestamp: Date.now(),
  idempotencyKey: input.idempotencyKey,
});

const getRpcBalanceInputSchema = z.object({
  account: base58AddressSchema,
  commitment: commitmentSchema.optional(),
  minContextSlot: z.number().int().nonnegative().optional(),
});

const getRpcAccountInfoInputSchema = z.object({
  account: base58AddressSchema,
  encoding: accountInfoEncodingSchema.default("base64"),
  commitment: commitmentSchema.optional(),
  minContextSlot: z.number().int().nonnegative().optional(),
  dataSlice: dataSliceSchema.optional(),
});

const getRpcMultipleAccountsInputSchema = z.object({
  accounts: z.array(base58AddressSchema).min(1).max(MAX_MULTIPLE_ACCOUNT_INPUTS),
  encoding: multipleAccountsEncodingSchema.default("base64"),
  commitment: commitmentSchema.optional(),
  minContextSlot: z.number().int().nonnegative().optional(),
  dataSlice: dataSliceSchema.optional(),
  chunkSize: z.number().int().min(1).max(100).optional(),
});

const getRpcTokenAccountsByOwnerInputSchema = z.object({
  ownerAddress: base58AddressSchema,
  mintAddress: base58AddressSchema.optional(),
  programId: base58AddressSchema.optional(),
  encoding: tokenAccountsEncodingSchema.default("jsonParsed"),
  commitment: commitmentSchema.optional(),
  minContextSlot: z.number().int().nonnegative().optional(),
}).superRefine((value, refinementCtx) => {
  const selectedCount = Number(Boolean(value.mintAddress)) + Number(Boolean(value.programId));
  if (selectedCount !== 1) {
    refinementCtx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide exactly one of `mintAddress` or `programId`.",
      path: ["mintAddress"],
    });
  }
});

const getRpcTokenSupplyInputSchema = z.object({
  mintAddress: base58AddressSchema,
  commitment: commitmentSchema.optional(),
  minContextSlot: z.number().int().nonnegative().optional(),
});

const getRpcTokenLargestAccountsInputSchema = z.object({
  mintAddress: base58AddressSchema,
  commitment: commitmentSchema.optional(),
  limit: z.number().int().min(1).max(MAX_TOKEN_LARGEST_ACCOUNT_RESULTS).default(10),
});

const getRpcSignaturesForAddressInputSchema = z.object({
  account: base58AddressSchema,
  before: signatureSchema.optional(),
  until: signatureSchema.optional(),
  limit: z.number().int().min(1).max(MAX_SIGNATURE_LIMIT).default(10),
  commitment: commitmentSchema.optional(),
  minContextSlot: z.number().int().nonnegative().optional(),
});

const getRpcTransactionInputSchema = z.object({
  signature: signatureSchema,
  encoding: transactionEncodingSchema.default("jsonParsed"),
  commitment: commitmentSchema.optional(),
  maxSupportedTransactionVersion: z.number().int().min(0).max(0).default(0),
});

type GetRpcBalanceInput = z.output<typeof getRpcBalanceInputSchema>;
type GetRpcAccountInfoInput = z.output<typeof getRpcAccountInfoInputSchema>;
type GetRpcMultipleAccountsInput = z.output<typeof getRpcMultipleAccountsInputSchema>;
type GetRpcTokenAccountsByOwnerInput = z.output<typeof getRpcTokenAccountsByOwnerInputSchema>;
type GetRpcTokenSupplyInput = z.output<typeof getRpcTokenSupplyInputSchema>;
type GetRpcTokenLargestAccountsInput = z.output<typeof getRpcTokenLargestAccountsInputSchema>;
type GetRpcSignaturesForAddressInput = z.output<typeof getRpcSignaturesForAddressInputSchema>;
type GetRpcTransactionInput = z.output<typeof getRpcTransactionInputSchema>;

interface RpcReadActionDeps {
  loadBalance?: typeof getBalance;
  loadAccountInfo?: typeof getAccountInfo;
  loadMultipleAccounts?: typeof getMultipleAccounts;
  loadTokenAccountsByOwner?: typeof getTokenAccountsByOwner;
  loadTokenSupply?: typeof getTokenSupply;
  loadTokenLargestAccounts?: typeof getTokenLargestAccounts;
  loadSignaturesForAddress?: typeof getSignaturesForAddress;
  loadTransaction?: typeof getTransaction;
}

export const createGetRpcBalanceAction = (
  deps: Pick<RpcReadActionDeps, "loadBalance"> = {},
): Action<GetRpcBalanceInput, unknown> => {
  const loadBalance = deps.loadBalance ?? getBalance;

  return {
    name: "getRpcBalance",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: getRpcBalanceInputSchema,
    async execute(ctx, input) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();

      try {
        const balance = await loadBalance({
          rpcUrl: ctx.rpcUrl,
          account: input.account,
          commitment: input.commitment,
          minContextSlot: input.minContextSlot === undefined ? undefined : BigInt(input.minContextSlot),
        });

        return createSuccess({
          startedAt,
          idempotencyKey,
          data: {
            account: input.account,
            contextSlot: balance.contextSlot.toString(),
            lamports: balance.lamports.toString(),
            sol: Number(balance.lamports) / 1_000_000_000,
          },
        });
      } catch (error) {
        return createFailure({ error, code: "GET_RPC_BALANCE", startedAt, idempotencyKey });
      }
    },
  };
};

export const createGetRpcAccountInfoAction = (
  deps: Pick<RpcReadActionDeps, "loadAccountInfo"> = {},
): Action<GetRpcAccountInfoInput, unknown> => {
  const loadAccountInfo = deps.loadAccountInfo ?? getAccountInfo;

  return {
    name: "getRpcAccountInfo",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: getRpcAccountInfoInputSchema,
    async execute(ctx, input) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();

      try {
        const result = await loadAccountInfo({
          rpcUrl: ctx.rpcUrl,
          account: input.account,
          encoding: input.encoding,
          commitment: input.commitment,
          minContextSlot: input.minContextSlot === undefined ? undefined : BigInt(input.minContextSlot),
          dataSlice: input.dataSlice,
        });

        return createSuccess({
          startedAt,
          idempotencyKey,
          data: {
            account: input.account,
            encoding: input.encoding,
            contextSlot: result.contextSlot.toString(),
            accountInfo: result.account,
            summary: summarizeAccountInfo(result.account, input.account),
          },
        });
      } catch (error) {
        return createFailure({ error, code: "GET_RPC_ACCOUNT_INFO", startedAt, idempotencyKey });
      }
    },
  };
};

export const createGetRpcMultipleAccountsAction = (
  deps: Pick<RpcReadActionDeps, "loadMultipleAccounts"> = {},
): Action<GetRpcMultipleAccountsInput, unknown> => {
  const loadMultipleAccounts = deps.loadMultipleAccounts ?? getMultipleAccounts;

  return {
    name: "getRpcMultipleAccounts",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: getRpcMultipleAccountsInputSchema,
    async execute(ctx, input) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();

      try {
        const result = await loadMultipleAccounts({
          rpcUrl: ctx.rpcUrl,
          accounts: input.accounts,
          encoding: input.encoding,
          commitment: input.commitment,
          minContextSlot: input.minContextSlot === undefined ? undefined : BigInt(input.minContextSlot),
          dataSlice: input.dataSlice,
          chunkSize: input.chunkSize,
        });

        return createSuccess({
          startedAt,
          idempotencyKey,
          data: {
            requested: input.accounts.length,
            returned: result.accounts.length,
            contextSlot: result.contextSlot.toString(),
            accounts: result.accounts.map((entry) => ({
              ...entry,
              summary: summarizeAccountInfo(entry, entry.address),
            })),
          },
        });
      } catch (error) {
        return createFailure({ error, code: "GET_RPC_MULTIPLE_ACCOUNTS", startedAt, idempotencyKey });
      }
    },
  };
};

export const createGetRpcTokenAccountsByOwnerAction = (
  deps: Pick<RpcReadActionDeps, "loadTokenAccountsByOwner"> = {},
): Action<GetRpcTokenAccountsByOwnerInput, unknown> => {
  const loadTokenAccountsByOwner = deps.loadTokenAccountsByOwner ?? getTokenAccountsByOwner;

  return {
    name: "getRpcTokenAccountsByOwner",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: getRpcTokenAccountsByOwnerInputSchema,
    async execute(ctx, input) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();

      try {
        const result = await loadTokenAccountsByOwner({
          rpcUrl: ctx.rpcUrl,
          ownerAddress: input.ownerAddress,
          mintAddress: input.mintAddress,
          programId: input.programId,
          encoding: input.encoding,
          commitment: input.commitment,
          minContextSlot: input.minContextSlot === undefined ? undefined : BigInt(input.minContextSlot),
        });

        const summarized = summarizeParsedTokenAccounts(result.accounts);
        return createSuccess({
          startedAt,
          idempotencyKey,
          data: {
            ownerAddress: input.ownerAddress,
            filter: input.mintAddress
              ? { mintAddress: input.mintAddress }
              : { programId: input.programId ?? null },
            encoding: input.encoding,
            contextSlot: result.contextSlot.toString(),
            returned: result.accounts.length,
            accounts: result.accounts.slice(0, MAX_TOKEN_ACCOUNT_RESULTS).map((entry) => ({
              ...entry,
              summary: summarizeParsedTokenAccount(entry, entry.address),
            })),
            parsedTokenAccounts: summarized.parsedTokenAccounts.slice(0, MAX_TOKEN_ACCOUNT_RESULTS),
            parsedTokenTotalsByMint: summarized.totalsByMint,
          },
        });
      } catch (error) {
        return createFailure({ error, code: "GET_RPC_TOKEN_ACCOUNTS_BY_OWNER", startedAt, idempotencyKey });
      }
    },
  };
};

export const createGetRpcTokenSupplyAction = (
  deps: Pick<RpcReadActionDeps, "loadTokenSupply"> = {},
): Action<GetRpcTokenSupplyInput, unknown> => {
  const loadTokenSupply = deps.loadTokenSupply ?? getTokenSupply;

  return {
    name: "getRpcTokenSupply",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: getRpcTokenSupplyInputSchema,
    async execute(ctx, input) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();

      try {
        const result = await loadTokenSupply({
          rpcUrl: ctx.rpcUrl,
          mintAddress: input.mintAddress,
          commitment: input.commitment,
          minContextSlot: input.minContextSlot === undefined ? undefined : BigInt(input.minContextSlot),
        });

        return createSuccess({
          startedAt,
          idempotencyKey,
          data: {
            mintAddress: input.mintAddress,
            contextSlot: result.contextSlot.toString(),
            amountRaw: result.amountRaw.toString(),
            decimals: result.decimals,
            uiAmountString: result.uiAmountString,
          },
        });
      } catch (error) {
        return createFailure({ error, code: "GET_RPC_TOKEN_SUPPLY", startedAt, idempotencyKey });
      }
    },
  };
};

export const createGetRpcTokenLargestAccountsAction = (
  deps: Pick<RpcReadActionDeps, "loadTokenLargestAccounts"> = {},
): Action<GetRpcTokenLargestAccountsInput, unknown> => {
  const loadTokenLargestAccounts = deps.loadTokenLargestAccounts ?? getTokenLargestAccounts;

  return {
    name: "getRpcTokenLargestAccounts",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: getRpcTokenLargestAccountsInputSchema,
    async execute(ctx, input) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();

      try {
        const result = await loadTokenLargestAccounts({
          rpcUrl: ctx.rpcUrl,
          mintAddress: input.mintAddress,
          commitment: input.commitment,
        });

        return createSuccess({
          startedAt,
          idempotencyKey,
          data: {
            mintAddress: input.mintAddress,
            contextSlot: result.contextSlot.toString(),
            returned: Math.min(input.limit, result.accounts.length),
            accounts: result.accounts.slice(0, input.limit).map((entry) => ({
              address: entry.address,
              amountRaw: entry.amountRaw.toString(),
              decimals: entry.decimals,
              uiAmountString: entry.uiAmountString,
            })),
          },
        });
      } catch (error) {
        return createFailure({ error, code: "GET_RPC_TOKEN_LARGEST_ACCOUNTS", startedAt, idempotencyKey });
      }
    },
  };
};

export const createGetRpcSignaturesForAddressAction = (
  deps: Pick<RpcReadActionDeps, "loadSignaturesForAddress"> = {},
): Action<GetRpcSignaturesForAddressInput, unknown> => {
  const loadSignaturesForAddress = deps.loadSignaturesForAddress ?? getSignaturesForAddress;

  return {
    name: "getRpcSignaturesForAddress",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: getRpcSignaturesForAddressInputSchema,
    async execute(ctx, input) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();

      try {
        const result = await loadSignaturesForAddress({
          rpcUrl: ctx.rpcUrl,
          account: input.account,
          before: input.before,
          until: input.until,
          limit: input.limit,
          commitment: input.commitment,
          minContextSlot: input.minContextSlot === undefined ? undefined : BigInt(input.minContextSlot),
        });

        return createSuccess({
          startedAt,
          idempotencyKey,
          data: {
            account: input.account,
            returned: result.signatures.length,
            signatures: result.signatures.map((entry) => ({
              signature: entry.signature,
              slot: entry.slot.toString(),
              error: entry.error,
              memo: entry.memo,
              blockTime: entry.blockTime,
              confirmationStatus: entry.confirmationStatus,
            })),
          },
        });
      } catch (error) {
        return createFailure({ error, code: "GET_RPC_SIGNATURES_FOR_ADDRESS", startedAt, idempotencyKey });
      }
    },
  };
};

export const createGetRpcTransactionAction = (
  deps: Pick<RpcReadActionDeps, "loadTransaction"> = {},
): Action<GetRpcTransactionInput, unknown> => {
  const loadTransaction = deps.loadTransaction ?? getTransaction;

  return {
    name: "getRpcTransaction",
    category: "data-based",
    subcategory: "read-only",
    inputSchema: getRpcTransactionInputSchema,
    async execute(ctx, input) {
      const startedAt = Date.now();
      const idempotencyKey = crypto.randomUUID();

      try {
        const result = await loadTransaction({
          rpcUrl: ctx.rpcUrl,
          signature: input.signature,
          encoding: input.encoding,
          commitment: input.commitment,
          maxSupportedTransactionVersion: input.maxSupportedTransactionVersion,
        });

        return createSuccess({
          startedAt,
          idempotencyKey,
          data: {
            signature: input.signature,
            encoding: input.encoding,
            slot: result.slot?.toString() ?? null,
            blockTime: result.blockTime,
            version: result.version ?? null,
            meta: result.meta,
            transaction: result.transaction,
          },
        });
      } catch (error) {
        return createFailure({ error, code: "GET_RPC_TRANSACTION", startedAt, idempotencyKey });
      }
    },
  };
};

export const getRpcBalanceAction = createGetRpcBalanceAction();
export const getRpcAccountInfoAction = createGetRpcAccountInfoAction();
export const getRpcMultipleAccountsAction = createGetRpcMultipleAccountsAction();
export const getRpcTokenAccountsByOwnerAction = createGetRpcTokenAccountsByOwnerAction();
export const getRpcTokenSupplyAction = createGetRpcTokenSupplyAction();
export const getRpcTokenLargestAccountsAction = createGetRpcTokenLargestAccountsAction();
export const getRpcSignaturesForAddressAction = createGetRpcSignaturesForAddressAction();
export const getRpcTransactionAction = createGetRpcTransactionAction();
