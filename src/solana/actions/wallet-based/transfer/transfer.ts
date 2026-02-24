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
  type Instruction,
} from "@solana/kit";

import type { Action, ActionResult } from "../../../../ai/contracts/action";
import type { ActionContext } from "../../../../ai/contracts/context";

const DEFAULT_SOLANA_MAINNET_RPC_URL = "https://api.mainnet-beta.solana.com";
const LAMPORTS_PER_SOL = 1_000_000_000;

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const transferInputSchema = z.object({
  destination: z.string().min(1),
  amount: z.number().positive(),
  mintAddress: z.string().min(1).optional(),
  decimals: z.number().int().min(0).max(18).optional(),
  tokenProgram: z.enum(["spl-token", "token-2022"]).optional(),
  sourceTokenAccount: z.string().min(1).optional(),
  destinationTokenAccount: z.string().min(1).optional(),
  createDestinationAta: z.boolean().optional(),
  skipPreflight: z.boolean().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
});

export type TransferInput = z.output<typeof transferInputSchema>;

export interface TransferOutput {
  transferType: "sol" | "spl";
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
): ActionResult<TransferOutput> => ({
  ok: false,
  error,
  code,
  retryable,
  durationMs: 0,
  timestamp: Date.now(),
  idempotencyKey,
});

const toLamports = (solAmount: number): bigint => {
  return BigInt(Math.round(solAmount * LAMPORTS_PER_SOL));
};

const toTokenRawAmount = (uiAmount: number, decimals: number): bigint => {
  return BigInt(Math.round(uiAmount * 10 ** decimals));
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
      const signer = (ctx as TransferContext).ultraSigner;
      if (!signer?.address) {
        return createFailure(
          idempotencyKey,
          "Missing signer in action context. Expected ctx.ultraSigner.address and signBase64Transaction().",
          "MISSING_SIGNER",
        );
      }

      const rpc = createSolanaRpc(process.env.RPC_URL ?? DEFAULT_SOLANA_MAINNET_RPC_URL);
      const latestBlockhash = await rpc.getLatestBlockhash().send();
      const instructions: Instruction[] = [];

      let transferOutput: Omit<TransferOutput, "txSignature">;

      if (!input.mintAddress) {
        const lamports = toLamports(input.amount);
        if (lamports <= 0n) {
          return createFailure(idempotencyKey, "Amount is too small after conversion to lamports.", "INVALID_AMOUNT");
        }

        instructions.push(createTransferSolInstruction(signer.address, input.destination, lamports));

        transferOutput = {
          transferType: "sol",
          destination: input.destination,
          amountUi: input.amount,
          amountRaw: lamports.toString(10),
        };
      } else {
        const tokenProgramId = getTokenProgramId(input.tokenProgram);
        const decimals = await resolveTokenDecimals(rpc, input.mintAddress, input.decimals);
        const amountRaw = toTokenRawAmount(input.amount, decimals);

        if (amountRaw <= 0n) {
          return createFailure(
            idempotencyKey,
            "Amount is too small after conversion to token base units.",
            "INVALID_AMOUNT",
          );
        }

        const sourceTokenAccount =
          input.sourceTokenAccount ??
          (await deriveAssociatedTokenAccount(signer.address, input.mintAddress, tokenProgramId));
        const destinationTokenAccount =
          input.destinationTokenAccount ??
          (await deriveAssociatedTokenAccount(input.destination, input.mintAddress, tokenProgramId));

        if (input.createDestinationAta ?? true) {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              signer.address,
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
            authority: signer.address,
            mintAddress: input.mintAddress,
            amount: amountRaw,
            decimals,
            tokenProgramId,
          }),
        );

        transferOutput = {
          transferType: "spl",
          destination: input.destination,
          mintAddress: input.mintAddress,
          amountUi: input.amount,
          amountRaw: amountRaw.toString(10),
          sourceTokenAccount,
          destinationTokenAccount,
          tokenProgram: input.tokenProgram ?? "spl-token",
        };
      }

      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayer(address(signer.address!), tx),
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
      const result = createFailure(idempotencyKey, message, "TRANSFER_FAILED", true);
      return {
        ...result,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    }
  },
};
