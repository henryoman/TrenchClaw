import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signature,
  type Instruction,
} from "@solana/kit";

import type { Action, ActionResult } from "../../../../ai/runtime/types/action";
import type { ActionContext } from "../../../../ai/runtime/types/context";
import { MISSING_RPC_URL_ERROR, resolveRequiredRpcUrl } from "../../../lib/rpc/urls";
import { loadManagedWalletSigner } from "../../../lib/wallet/wallet-signer";
import { walletGroupNameSchema, walletNameSchema } from "../../../lib/wallet/wallet-types";

const LAMPORTS_PER_SOL = 1_000_000_000;

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const TRANSFER_CONFIRMATION_TIMEOUT_MS = 45_000;
const TRANSFER_CONFIRMATION_POLL_INTERVAL_MS = 500;

type CommitmentLevel = "processed" | "confirmed" | "finalized";
type TransferAmountInput = number | string;
type TransferAmountResolution = {
  uiAmountString: string;
  uiAmountNumber: number;
  rawAmount: bigint;
};
const transferAmountSchema = z.union([z.number().positive(), z.string().trim().min(1)]);

const transferInputSchema = z.object({
  destination: z.string().min(1),
  amount: transferAmountSchema,
  walletGroup: walletGroupNameSchema.optional(),
  walletName: walletNameSchema.optional(),
  mintAddress: z.string().min(1).optional(),
  decimals: z.number().int().min(0).max(18).optional(),
  tokenProgram: z.enum(["spl-token", "token-2022"]).optional(),
  sourceTokenAccount: z.string().min(1).optional(),
  destinationTokenAccount: z.string().min(1).optional(),
  createDestinationAta: z.boolean().optional(),
  skipPreflight: z.boolean().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
}).superRefine((value, ctx) => {
  const hasWalletGroup = typeof value.walletGroup === "string";
  const hasWalletName = typeof value.walletName === "string";
  if (hasWalletGroup !== hasWalletName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide walletGroup and walletName together.",
      path: hasWalletGroup ? ["walletName"] : ["walletGroup"],
    });
  }
});

export type TransferInput = z.output<typeof transferInputSchema>;

export interface TransferOutput {
  transferType: "sol" | "spl";
  sourceAddress: string;
  destination: string;
  mintAddress?: string;
  amountUi: number;
  amountRaw: string;
  sourceTokenAccount?: string;
  destinationTokenAccount?: string;
  tokenProgram?: "spl-token" | "token-2022";
  txSignature: string;
}

interface TransferContext extends ActionContext {
  rpcUrl?: string;
  ultraSigner?: {
    address?: string;
    signBase64Transaction: (base64Transaction: string) => Promise<string>;
  };
}

const resolveTransferSigner = async (
  ctx: TransferContext,
  input: TransferInput,
): Promise<NonNullable<TransferContext["ultraSigner"]>> => {
  if (ctx.ultraSigner?.address) {
    return ctx.ultraSigner;
  }

  if (input.walletGroup && input.walletName) {
    return loadManagedWalletSigner({
      walletGroup: input.walletGroup,
      walletName: input.walletName,
      rpcUrl: ctx.rpcUrl,
    });
  }

  throw new Error(
    "Missing signer in action context. Provide ctx.ultraSigner or input.walletGroup and input.walletName.",
  );
};

const createFailure = (
  idempotencyKey: string,
  error: string,
  code: string,
  retryable = false,
): ActionResult<TransferOutput> => ({
  ok: false,
  error,
  code,
  retryable,
  durationMs: 0,
  timestamp: Date.now(),
  idempotencyKey,
});

const numberToPlainString = (value: number): string => {
  const raw = value.toString();
  if (!/[eE]/.test(raw)) {
    return raw;
  }

  const [mantissa, exponentPart = "0"] = raw.toLowerCase().split("e");
  const exponent = Number(exponentPart);
  if (!Number.isInteger(exponent)) {
    throw new Error(`Unable to normalize numeric amount "${raw}"`);
  }

  const negative = mantissa.startsWith("-");
  const unsignedMantissa = negative ? mantissa.slice(1) : mantissa;
  const [whole = "0", fraction = ""] = unsignedMantissa.split(".");
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  const decimalIndex = whole.length + exponent;

  if (decimalIndex <= 0) {
    return `${negative ? "-" : ""}0.${"0".repeat(-decimalIndex)}${digits}`;
  }

  if (decimalIndex >= digits.length) {
    return `${negative ? "-" : ""}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  }

  return `${negative ? "-" : ""}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
};

const normalizeUiAmountString = (value: TransferAmountInput, scale: number): string => {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
    throw new Error(`Invalid amount scale "${scale}"`);
  }

  const raw = typeof value === "number" ? numberToPlainString(value) : value.trim();
  if (raw.length === 0) {
    throw new Error("Amount is required.");
  }
  if (/[eE]/.test(raw)) {
    throw new Error(`Amount "${raw}" must be a plain decimal value.`);
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) {
    throw new Error(`Amount "${raw}" must be a positive decimal value.`);
  }

  const [intPartRaw, fracPartRaw = ""] = raw.split(".");
  if (fracPartRaw.length > scale) {
    throw new Error(`Amount "${raw}" has more than ${scale} decimal places.`);
  }

  const intPart = intPartRaw.replace(/^0+(?=\d)/, "") || "0";
  const fracPart = fracPartRaw.replace(/0+$/, "");
  const normalized = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;

  if (/^0(?:\.0+)?$/.test(normalized)) {
    throw new Error("Amount must be greater than zero.");
  }

  return normalized;
};

const toScaledRawAmount = (uiAmountString: string, scale: number): bigint => {
  const [intPartRaw, fracPartRaw = ""] = uiAmountString.split(".");
  const intPart = intPartRaw || "0";
  const fracPart = fracPartRaw.padEnd(scale, "0").slice(0, scale);
  const normalized = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, "") || "0";
  return BigInt(normalized);
};

const resolveTransferAmount = (value: TransferAmountInput, scale: number): TransferAmountResolution => {
  const uiAmountString = normalizeUiAmountString(value, scale);
  const uiAmountNumber = Number(uiAmountString);
  if (!Number.isFinite(uiAmountNumber) || uiAmountNumber <= 0) {
    throw new Error(`Amount "${uiAmountString}" is not a valid positive number.`);
  }

  return {
    uiAmountString,
    uiAmountNumber,
    rawAmount: toScaledRawAmount(uiAmountString, scale),
  };
};

const isCommitmentSatisfied = (actual: CommitmentLevel | null, required: CommitmentLevel): boolean => {
  if (!actual) {
    return false;
  }

  const order: CommitmentLevel[] = ["processed", "confirmed", "finalized"];
  return order.indexOf(actual) >= order.indexOf(required);
};

const waitForTransferConfirmation = async (input: {
  rpc: ReturnType<typeof createSolanaRpc>;
  txSignature: string;
  timeoutMs?: number;
  commitment?: CommitmentLevel;
}): Promise<void> => {
  const timeoutAt = Date.now() + (input.timeoutMs ?? TRANSFER_CONFIRMATION_TIMEOUT_MS);
  const requiredCommitment = input.commitment ?? "confirmed";

  while (Date.now() < timeoutAt) {
    const response = await (input.rpc as any).getSignatureStatuses(
      [signature(input.txSignature)],
      { searchTransactionHistory: true },
    ).send();
    const status = response?.value?.[0] as
      | {
          err?: unknown;
          confirmationStatus?: CommitmentLevel | null;
        }
      | null
      | undefined;

    if (status?.err) {
      throw new Error(`Transfer transaction ${input.txSignature} failed: ${JSON.stringify(status.err)}`);
    }

    if (status && isCommitmentSatisfied(status.confirmationStatus ?? null, requiredCommitment)) {
      return;
    }

    await Bun.sleep(TRANSFER_CONFIRMATION_POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for transfer confirmation for signature ${input.txSignature}`);
};

const encodeSystemTransferData = (lamports: bigint): Uint8Array => {
  const bytes = new Uint8Array(12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 2, true);
  view.setBigUint64(4, lamports, true);
  return bytes;
};

const encodeTokenTransferCheckedData = (amount: bigint, decimals: number): Uint8Array => {
  const bytes = new Uint8Array(10);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, 12);
  view.setBigUint64(1, amount, true);
  view.setUint8(9, decimals);
  return bytes;
};

const getTokenProgramId = (tokenProgram: TransferInput["tokenProgram"]): string => {
  return tokenProgram === "token-2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
};

const deriveAssociatedTokenAccount = async (owner: string, mintAddress: string, tokenProgramId: string) => {
  const encoder = getAddressEncoder();
  const [associatedTokenAddress] = await getProgramDerivedAddress({
    programAddress: address(ASSOCIATED_TOKEN_PROGRAM_ID),
    seeds: [
      encoder.encode(address(owner)),
      encoder.encode(address(tokenProgramId)),
      encoder.encode(address(mintAddress)),
    ],
  });
  return String(associatedTokenAddress);
};

const createAssociatedTokenAccountInstruction = (payer: string, owner: string, mintAddress: string, tokenProgramId: string, ataAddress: string): Instruction => ({
  programAddress: address(ASSOCIATED_TOKEN_PROGRAM_ID),
  accounts: [
    { address: address(payer), role: AccountRole.WRITABLE_SIGNER },
    { address: address(ataAddress), role: AccountRole.WRITABLE },
    { address: address(owner), role: AccountRole.READONLY },
    { address: address(mintAddress), role: AccountRole.READONLY },
    { address: address(SYSTEM_PROGRAM_ID), role: AccountRole.READONLY },
    { address: address(tokenProgramId), role: AccountRole.READONLY },
  ],
  data: new Uint8Array([1]),
});

const createTransferSolInstruction = (source: string, destination: string, lamports: bigint): Instruction => ({
  programAddress: address(SYSTEM_PROGRAM_ID),
  accounts: [
    { address: address(source), role: AccountRole.WRITABLE_SIGNER },
    { address: address(destination), role: AccountRole.WRITABLE },
  ],
  data: encodeSystemTransferData(lamports),
});

const createTransferTokenCheckedInstruction = (params: {
  sourceTokenAccount: string;
  destinationTokenAccount: string;
  authority: string;
  mintAddress: string;
  amount: bigint;
  decimals: number;
  tokenProgramId: string;
}): Instruction => ({
  programAddress: address(params.tokenProgramId),
  accounts: [
    { address: address(params.sourceTokenAccount), role: AccountRole.WRITABLE },
    { address: address(params.mintAddress), role: AccountRole.READONLY },
    { address: address(params.destinationTokenAccount), role: AccountRole.WRITABLE },
    { address: address(params.authority), role: AccountRole.READONLY_SIGNER },
  ],
  data: encodeTokenTransferCheckedData(params.amount, params.decimals),
});

const resolveTokenDecimals = async (
  rpc: ReturnType<typeof createSolanaRpc>,
  mintAddress: string,
  inputDecimals?: number,
): Promise<number> => {
  if (typeof inputDecimals === "number") {
    return inputDecimals;
  }

  const supply = await (rpc as any).getTokenSupply(address(mintAddress)).send();
  const decimals = supply?.value?.decimals;
  if (typeof decimals !== "number") {
    throw new Error(`Unable to resolve token decimals for mint ${mintAddress}`);
  }
  return decimals;
};

export const transferAction: Action<TransferInput, TransferOutput> = {
  name: "transfer",
  category: "wallet-based",
  subcategory: "transfer",
  inputSchema: transferInputSchema,
  async execute(ctx, input) {
    const startedAt = performance.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const signer = await resolveTransferSigner(ctx as TransferContext, input);
      const signerAddress = signer.address;
      if (!signerAddress) {
        return createFailure(idempotencyKey, "Resolved signer is missing an address.", "MISSING_SIGNER");
      }

      const rpcUrl = resolveRequiredRpcUrl((ctx as TransferContext).rpcUrl);
      const rpc = createSolanaRpc(rpcUrl);
      const latestBlockhash = await rpc.getLatestBlockhash().send();
      const instructions: Instruction[] = [];

      let transferOutput: Omit<TransferOutput, "txSignature">;

      if (!input.mintAddress) {
        const amount = resolveTransferAmount(input.amount, 9);
        const lamports = amount.rawAmount;
        if (lamports <= 0n) {
          return createFailure(idempotencyKey, "Amount is too small after conversion to lamports.", "INVALID_AMOUNT");
        }

        instructions.push(createTransferSolInstruction(signerAddress, input.destination, lamports));

        transferOutput = {
          transferType: "sol",
          sourceAddress: signerAddress,
          destination: input.destination,
          amountUi: amount.uiAmountNumber,
          amountRaw: lamports.toString(10),
        };
      } else {
        const tokenProgramId = getTokenProgramId(input.tokenProgram);
        const decimals = await resolveTokenDecimals(rpc, input.mintAddress, input.decimals);
        const amount = resolveTransferAmount(input.amount, decimals);
        const amountRaw = amount.rawAmount;

        if (amountRaw <= 0n) {
          return createFailure(
            idempotencyKey,
            "Amount is too small after conversion to token base units.",
            "INVALID_AMOUNT",
          );
        }

        const sourceTokenAccount =
          input.sourceTokenAccount ??
          (await deriveAssociatedTokenAccount(signerAddress, input.mintAddress, tokenProgramId));
        const destinationTokenAccount =
          input.destinationTokenAccount ??
          (await deriveAssociatedTokenAccount(input.destination, input.mintAddress, tokenProgramId));

        if (input.createDestinationAta ?? true) {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              signerAddress,
              input.destination,
              input.mintAddress,
              tokenProgramId,
              destinationTokenAccount,
            ),
          );
        }

        instructions.push(
          createTransferTokenCheckedInstruction({
            sourceTokenAccount,
            destinationTokenAccount,
            authority: signerAddress,
            mintAddress: input.mintAddress,
            amount: amountRaw,
            decimals,
            tokenProgramId,
          }),
        );

        transferOutput = {
          transferType: "spl",
          sourceAddress: signerAddress,
          destination: input.destination,
          mintAddress: input.mintAddress,
          amountUi: amount.uiAmountNumber,
          amountRaw: amountRaw.toString(10),
          sourceTokenAccount,
          destinationTokenAccount,
          tokenProgram: input.tokenProgram ?? "spl-token",
        };
      }

      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayer(address(signerAddress), tx),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash.value, tx),
        (tx) => appendTransactionMessageInstructions(instructions, tx),
      );

      const unsignedTransaction = compileTransaction(message);
      const unsignedBase64 = getBase64EncodedWireTransaction(unsignedTransaction);
      const signedBase64 = await signer.signBase64Transaction(unsignedBase64);

      const signature = await (rpc as any)
        .sendTransaction(signedBase64, {
          encoding: "base64",
          skipPreflight: input.skipPreflight ?? false,
          maxRetries: input.maxRetries ?? 0,
        })
        .send();
      await waitForTransferConfirmation({
        rpc,
        txSignature: String(signature),
      });

      const result: ActionResult<TransferOutput> = {
        ok: true,
        retryable: false,
        txSignature: String(signature),
        data: {
          ...transferOutput,
          txSignature: String(signature),
        },
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        timestamp: Date.now(),
        idempotencyKey,
      };

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === MISSING_RPC_URL_ERROR) {
        return createFailure(idempotencyKey, message, "MISSING_RPC_URL");
      }
      const result = createFailure(idempotencyKey, message, "TRANSFER_FAILED", true);
      return {
        ...result,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    }
  },
};
