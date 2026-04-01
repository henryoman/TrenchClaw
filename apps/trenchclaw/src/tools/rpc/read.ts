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

const isRetryableRpcError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b/u.test(message)
    || /\b403\b/u.test(message)
    || /rate limit/iu.test(message)
    || /too many requests/iu.test(message)
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
            accounts: result.accounts,
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
            accounts: result.accounts.slice(0, MAX_TOKEN_ACCOUNT_RESULTS),
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
