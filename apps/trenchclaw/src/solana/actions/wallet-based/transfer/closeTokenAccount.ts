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

const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const CLOSE_ACCOUNT_INSTRUCTION = new Uint8Array([9]);
const CLOSE_TOKEN_ACCOUNT_CONFIRMATION_TIMEOUT_MS = 45_000;
const CLOSE_TOKEN_ACCOUNT_POLL_INTERVAL_MS = 500;

type CommitmentLevel = "processed" | "confirmed" | "finalized";

const closeTokenAccountInputSchema = z.object({
  walletGroup: walletGroupNameSchema.optional(),
  walletName: walletNameSchema.optional(),
  mintAddress: z.string().trim().min(1).optional(),
  tokenAccountAddress: z.string().trim().min(1).optional(),
  destination: z.string().trim().min(1).optional(),
  tokenProgram: z.enum(["spl-token", "token-2022"]).optional(),
  skipPreflight: z.boolean().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  userConfirmationToken: z.string().trim().min(1).optional(),
  confirmedByUser: z.boolean().optional(),
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

  if (!value.tokenAccountAddress && !value.mintAddress) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide mintAddress or tokenAccountAddress.",
      path: ["mintAddress"],
    });
  }
});

export type CloseTokenAccountInput = z.output<typeof closeTokenAccountInputSchema>;

export interface CloseTokenAccountOutput {
  sourceAddress: string;
  tokenAccountAddress: string;
  destination: string;
  mintAddress?: string;
  tokenProgram: "spl-token" | "token-2022";
  txSignature: string;
}

interface CloseTokenAccountContext extends ActionContext {
  rpcUrl?: string;
  ultraSigner?: {
    address?: string;
    signBase64Transaction: (base64Transaction: string) => Promise<string>;
  };
}

const createFailure = (
  idempotencyKey: string,
  error: string,
  code: string,
  retryable = false,
): ActionResult<CloseTokenAccountOutput> => ({
  ok: false,
  error,
  code,
  retryable,
  durationMs: 0,
  timestamp: Date.now(),
  idempotencyKey,
});

const getTokenProgramId = (tokenProgram: CloseTokenAccountInput["tokenProgram"]): string =>
  tokenProgram === "token-2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

const resolveSigner = async (
  ctx: CloseTokenAccountContext,
  input: CloseTokenAccountInput,
): Promise<NonNullable<CloseTokenAccountContext["ultraSigner"]>> => {
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

const deriveAssociatedTokenAccount = async (owner: string, mintAddress: string, tokenProgramId: string): Promise<string> => {
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

const createCloseTokenAccountInstruction = (params: {
  tokenAccountAddress: string;
  destination: string;
  authority: string;
  tokenProgramId: string;
}): Instruction => ({
  programAddress: address(params.tokenProgramId),
  accounts: [
    { address: address(params.tokenAccountAddress), role: AccountRole.WRITABLE },
    { address: address(params.destination), role: AccountRole.WRITABLE },
    { address: address(params.authority), role: AccountRole.READONLY_SIGNER },
  ],
  data: CLOSE_ACCOUNT_INSTRUCTION,
});

const isCommitmentSatisfied = (actual: CommitmentLevel | null, required: CommitmentLevel): boolean => {
  if (!actual) {
    return false;
  }

  const order: CommitmentLevel[] = ["processed", "confirmed", "finalized"];
  return order.indexOf(actual) >= order.indexOf(required);
};

const waitForCloseConfirmation = async (input: {
  rpc: ReturnType<typeof createSolanaRpc>;
  txSignature: string;
  timeoutMs?: number;
  commitment?: CommitmentLevel;
}): Promise<void> => {
  const timeoutAt = Date.now() + (input.timeoutMs ?? CLOSE_TOKEN_ACCOUNT_CONFIRMATION_TIMEOUT_MS);
  const requiredCommitment = input.commitment ?? "confirmed";

  while (Date.now() < timeoutAt) {
    // Polling for confirmation is intentionally sequential.
    // eslint-disable-next-line no-await-in-loop
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
      throw new Error(`Close token account transaction ${input.txSignature} failed: ${JSON.stringify(status.err)}`);
    }

    if (status && isCommitmentSatisfied(status.confirmationStatus ?? null, requiredCommitment)) {
      return;
    }

    // eslint-disable-next-line no-await-in-loop
    await Bun.sleep(CLOSE_TOKEN_ACCOUNT_POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for close token account confirmation for signature ${input.txSignature}`);
};

const assertAccountEmpty = async (rpc: ReturnType<typeof createSolanaRpc>, tokenAccountAddress: string): Promise<void> => {
  const balance = await (rpc as any).getTokenAccountBalance(address(tokenAccountAddress)).send();
  const rawAmount = balance?.value?.amount;
  if (typeof rawAmount !== "string") {
    throw new Error(`Unable to resolve token balance for account ${tokenAccountAddress}`);
  }
  if (rawAmount !== "0") {
    throw new Error(`Token account ${tokenAccountAddress} must be empty before it can be closed.`);
  }
};

export const closeTokenAccountAction: Action<CloseTokenAccountInput, CloseTokenAccountOutput> = {
  name: "closeTokenAccount",
  category: "wallet-based",
  subcategory: "transfer",
  inputSchema: closeTokenAccountInputSchema,
  async execute(ctx, input) {
    const startedAt = performance.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const signer = await resolveSigner(ctx as CloseTokenAccountContext, input);
      const signerAddress = signer.address;
      if (!signerAddress) {
        return createFailure(idempotencyKey, "Resolved signer is missing an address.", "MISSING_SIGNER");
      }

      const rpcUrl = resolveRequiredRpcUrl((ctx as CloseTokenAccountContext).rpcUrl);
      const rpc = createSolanaRpc(rpcUrl);
      const tokenProgramId = getTokenProgramId(input.tokenProgram);
      const tokenAccountAddress =
        input.tokenAccountAddress ??
        (await deriveAssociatedTokenAccount(
          signerAddress,
          input.mintAddress as string,
          tokenProgramId,
        ));
      const destination = input.destination ?? signerAddress;

      await assertAccountEmpty(rpc, tokenAccountAddress);

      const latestBlockhash = await rpc.getLatestBlockhash().send();
      const instruction = createCloseTokenAccountInstruction({
        tokenAccountAddress,
        destination,
        authority: signerAddress,
        tokenProgramId,
      });

      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayer(address(signerAddress), tx),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash.value, tx),
        (tx) => appendTransactionMessageInstructions([instruction], tx),
      );

      const unsignedTransaction = compileTransaction(message);
      const unsignedBase64 = getBase64EncodedWireTransaction(unsignedTransaction);
      const signedBase64 = await signer.signBase64Transaction(unsignedBase64);
      const txSignature = await (rpc as any)
        .sendTransaction(signedBase64, {
          encoding: "base64",
          skipPreflight: input.skipPreflight ?? false,
          maxRetries: input.maxRetries ?? 0,
        })
        .send();

      await waitForCloseConfirmation({
        rpc,
        txSignature: String(txSignature),
      });

      return {
        ok: true,
        retryable: false,
        txSignature: String(txSignature),
        data: {
          sourceAddress: signerAddress,
          tokenAccountAddress,
          destination,
          mintAddress: input.mintAddress,
          tokenProgram: input.tokenProgram ?? "spl-token",
          txSignature: String(txSignature),
        },
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        timestamp: Date.now(),
        idempotencyKey,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === MISSING_RPC_URL_ERROR) {
        return createFailure(idempotencyKey, message, "MISSING_RPC_URL");
      }
      const result = createFailure(idempotencyKey, message, "CLOSE_TOKEN_ACCOUNT_FAILED", true);
      return {
        ...result,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    }
  },
};
