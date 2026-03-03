import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { z } from "zod";

import type { Action, ActionResult } from "../../../../ai/runtime/types/action";
import type { ActionContext } from "../../../../ai/runtime/types/context";
import type { UltraSwapOutput } from "../swap/ultra/swap";
import { ultraSwapAction } from "../swap/ultra/swap";
import { resolveRequiredRpcUrl } from "../../../lib/rpc/urls";

const LAMPORTS_PER_SOL = 1_000_000_000;
const SOL_MINT = "So11111111111111111111111111111111111111112";

interface PrivacyCashClient {
  getPrivateBalance(): Promise<{ lamports: number }>;
  deposit(input: { lamports: number }): Promise<{ tx: string }>;
  withdraw(input: { lamports: number; recipientAddress: string }): Promise<{
    tx: string;
    fee_in_lamports: number;
  }>;
}

type PrivacyCashConstructor = new (input: {
  RPC_url: string;
  owner: number[];
  enableDebug: boolean;
}) => PrivacyCashClient;

const basePrivacyInputSchema = z.object({
  rpcUrl: z.string().min(1).optional(),
  ownerSecretKey: z.array(z.number().int().min(0).max(255)).min(32).optional(),
  ownerKeypairPath: z.string().min(1).optional(),
  forceDeposit: z.boolean().optional(),
  skipDeposit: z.boolean().optional(),
  planOnly: z.boolean().optional(),
  enableDebug: z.boolean().optional(),
});

const privacyRecipientSchema = z.object({
  address: z.string().min(1),
  amountSol: z.number().positive(),
});

const privacyTransferInputSchema = basePrivacyInputSchema.and(
  z.object({
    recipients: z.array(privacyRecipientSchema).min(1),
  }),
);

const privacySwapInputSchema = basePrivacyInputSchema.and(
  z.object({
    amountSol: z.number().positive(),
    outputCoin: z.string().min(1),
    inputCoin: z.string().min(1).optional(),
    mode: z.enum(["ExactIn", "ExactOut"]).optional(),
    slippageBps: z.number().int().positive().max(10_000).optional(),
  }),
);

type PrivacyTransferInput = z.output<typeof privacyTransferInputSchema>;
type PrivacySwapInput = z.output<typeof privacySwapInputSchema>;

interface PrivacyTransferResultItem {
  address: string;
  amountSol: number;
  amountLamports: number;
  txSignature?: string;
  feeLamports?: number;
}

interface PrivacyTransferOutput {
  rpcUrl: string;
  planOnly: boolean;
  forceDeposit: boolean;
  skipDeposit: boolean;
  totalLamports: number;
  totalSol: number;
  initialPrivateBalanceLamports?: number;
  depositLamports?: number;
  remainingPrivateBalanceLamports?: number;
  transfers: PrivacyTransferResultItem[];
}

interface PrivacySwapOutput {
  transfer: PrivacyTransferOutput;
  swap: ActionResult<UltraSwapOutput>;
}

const createFailure = <TData = unknown>(
  idempotencyKey: string,
  error: string,
  code: string,
  retryable = false,
): ActionResult<TData> => ({
  ok: false,
  error,
  code,
  retryable,
  durationMs: 0,
  timestamp: Date.now(),
  idempotencyKey,
});

const toLamports = (solAmount: number): number => {
  if (!Number.isFinite(solAmount) || solAmount <= 0) {
    throw new Error("amountSol must be a positive number");
  }

  const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);
  if (!Number.isSafeInteger(lamports) || lamports <= 0) {
    throw new Error("amountSol is invalid after lamport conversion");
  }
  return lamports;
};

const sumLamports = (amounts: number[]): number => {
  const total = amounts.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new Error("total transfer lamports overflow or invalid");
  }
  return total;
};

const resolveOwnerSecret = async (input: {
  ownerSecretKey?: number[];
  ownerKeypairPath?: string;
}): Promise<number[]> => {
  if (input.ownerSecretKey && input.ownerSecretKey.length > 0) {
    return input.ownerSecretKey;
  }

  if (!input.ownerKeypairPath) {
    throw new Error("Provide ownerSecretKey or ownerKeypairPath");
  }

  const raw = await readFile(input.ownerKeypairPath, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "number")) {
    throw new Error(`Invalid keypair JSON at ${input.ownerKeypairPath}`);
  }
  return parsed as number[];
};

const loadPrivacyCashConstructor = async (): Promise<PrivacyCashConstructor> => {
  const moduleName = "privacycash";
  const loaded = (await import(moduleName)) as { PrivacyCash?: PrivacyCashConstructor };
  if (typeof loaded.PrivacyCash !== "function") {
    throw new Error(`Module "${moduleName}" does not export PrivacyCash`);
  }
  return loaded.PrivacyCash;
};

const runPrivacyTransfers = async (
  input: PrivacyTransferInput,
): Promise<{ output: PrivacyTransferOutput; txSignatures: string[] }> => {
  const rpcUrl = resolveRequiredRpcUrl(input.rpcUrl);
  const forceDeposit = input.forceDeposit ?? false;
  const skipDeposit = input.skipDeposit ?? false;
  const planOnly = input.planOnly ?? false;

  const plannedTransfers = input.recipients.map((recipient) => ({
    address: recipient.address,
    amountSol: recipient.amountSol,
    amountLamports: toLamports(recipient.amountSol),
  }));

  const totalLamports = sumLamports(plannedTransfers.map((entry) => entry.amountLamports));
  const baseOutput: PrivacyTransferOutput = {
    rpcUrl,
    planOnly,
    forceDeposit,
    skipDeposit,
    totalLamports,
    totalSol: totalLamports / LAMPORTS_PER_SOL,
    transfers: plannedTransfers,
  };

  if (planOnly) {
    return { output: baseOutput, txSignatures: [] };
  }

  const ownerSecret = await resolveOwnerSecret({
    ownerSecretKey: input.ownerSecretKey,
    ownerKeypairPath: input.ownerKeypairPath,
  });
  const PrivacyCash = await loadPrivacyCashConstructor();

  const client = new PrivacyCash({
    RPC_url: rpcUrl,
    owner: ownerSecret,
    enableDebug: input.enableDebug ?? false,
  });

  const initialBalance = await client.getPrivateBalance();
  const initialBalanceLamports = initialBalance.lamports;

  let depositLamports = 0;
  if (forceDeposit) {
    depositLamports = totalLamports;
  } else if (initialBalanceLamports < totalLamports) {
    depositLamports = totalLamports - initialBalanceLamports;
  }

  if (skipDeposit && depositLamports > 0) {
    throw new Error(
      "skipDeposit=true but private balance is insufficient to cover requested transfer amount",
    );
  }

  if (!skipDeposit && depositLamports > 0) {
    await client.deposit({ lamports: depositLamports });
  }

  const results: PrivacyTransferResultItem[] = [];
  const txSignatures: string[] = [];

  for (const entry of plannedTransfers) {
    const withdrawal = await client.withdraw({
      lamports: entry.amountLamports,
      recipientAddress: entry.address,
    });
    results.push({
      ...entry,
      txSignature: withdrawal.tx,
      feeLamports: withdrawal.fee_in_lamports,
    });
    txSignatures.push(withdrawal.tx);
  }

  const remainingBalance = await client.getPrivateBalance();
  return {
    output: {
      ...baseOutput,
      initialPrivateBalanceLamports: initialBalanceLamports,
      depositLamports,
      remainingPrivateBalanceLamports: remainingBalance.lamports,
      transfers: results,
    },
    txSignatures,
  };
};

export const privacyTransferAction: Action<PrivacyTransferInput, PrivacyTransferOutput> = {
  name: "privacyTransfer",
  category: "wallet-based",
  subcategory: "transfer",
  inputSchema: privacyTransferInputSchema,
  async execute(_ctx: ActionContext, input: PrivacyTransferInput) {
    const startedAt = performance.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const { output, txSignatures } = await runPrivacyTransfers(input);
      const txSignature = txSignatures.length > 0 ? txSignatures[txSignatures.length - 1] : undefined;

      return {
        ok: true,
        retryable: false,
        txSignature,
        data: output,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        timestamp: Date.now(),
        idempotencyKey,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = createFailure<PrivacyTransferOutput>(
        idempotencyKey,
        message,
        "PRIVACY_TRANSFER_FAILED",
        true,
      );
      return {
        ...result,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    }
  },
};

export const privacyAirdropAction: Action<PrivacyTransferInput, PrivacyTransferOutput> = {
  name: "privacyAirdrop",
  category: "wallet-based",
  subcategory: "transfer",
  inputSchema: privacyTransferInputSchema,
  async execute(ctx, input) {
    return privacyTransferAction.execute(ctx, input);
  },
};

export const privacySwapAction: Action<PrivacySwapInput, PrivacySwapOutput> = {
  name: "privacySwap",
  category: "wallet-based",
  subcategory: "swap",
  inputSchema: privacySwapInputSchema,
  async execute(ctx, input: PrivacySwapInput) {
    const startedAt = performance.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const inputCoin = input.inputCoin ?? SOL_MINT;
      if (inputCoin !== SOL_MINT) {
        return createFailure<PrivacySwapOutput>(
          idempotencyKey,
          `privacySwap currently only supports ${SOL_MINT} as inputCoin`,
          "PRIVACY_SWAP_INPUT_UNSUPPORTED",
          false,
        );
      }

      const signerAddress = ctx.ultraSigner?.address;
      if (!signerAddress) {
        return createFailure<PrivacySwapOutput>(
          idempotencyKey,
          "Missing ctx.ultraSigner.address required for privacySwap",
          "MISSING_SIGNER",
          false,
        );
      }

      const transferInput: PrivacyTransferInput = {
        rpcUrl: input.rpcUrl,
        ownerSecretKey: input.ownerSecretKey,
        ownerKeypairPath: input.ownerKeypairPath,
        forceDeposit: input.forceDeposit,
        skipDeposit: input.skipDeposit,
        planOnly: input.planOnly,
        enableDebug: input.enableDebug,
        recipients: [{ address: signerAddress, amountSol: input.amountSol }],
      };

      const { output: transferOutput } = await runPrivacyTransfers(transferInput);
      if (input.planOnly) {
        const result: ActionResult<PrivacySwapOutput> = {
          ok: true,
          retryable: false,
          data: {
            transfer: transferOutput,
            swap: {
              ok: true,
              retryable: false,
              data: {
                requestId: "plan-only",
                status: "PlanOnly",
                order: {},
                telemetry: {
                  requestId: "plan-only",
                  inputMint: inputCoin,
                  outputMint: input.outputCoin,
                  amountLamports: String(toLamports(input.amountSol)),
                  slippageBps: input.slippageBps ?? 50,
                  timings: {
                    orderMs: 0,
                    signingMs: 0,
                    submitMs: 0,
                    totalMs: 0,
                  },
                },
              },
              durationMs: 0,
              timestamp: Date.now(),
              idempotencyKey: `${idempotencyKey}-plan`,
            },
          },
          durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
          timestamp: Date.now(),
          idempotencyKey,
        };
        return result;
      }

      const swapResult = await ultraSwapAction.execute(ctx, {
        inputCoin,
        outputCoin: input.outputCoin,
        amount: String(toLamports(input.amountSol)),
        amountUnit: "native",
        mode: input.mode,
        slippageBps: input.slippageBps,
        taker: signerAddress,
      });

      if (!swapResult.ok) {
        const result: ActionResult<PrivacySwapOutput> = {
          ok: false,
          retryable: swapResult.retryable,
          error: swapResult.error,
          code: swapResult.code ?? "PRIVACY_SWAP_EXECUTION_FAILED",
          data: {
            transfer: transferOutput,
            swap: swapResult,
          },
          durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
          timestamp: Date.now(),
          idempotencyKey,
        };
        return result;
      }

      const result: ActionResult<PrivacySwapOutput> = {
        ok: true,
        retryable: false,
        txSignature: swapResult.txSignature,
        data: {
          transfer: transferOutput,
          swap: swapResult,
        },
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        timestamp: Date.now(),
        idempotencyKey,
      };
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = createFailure<PrivacySwapOutput>(
        idempotencyKey,
        message,
        "PRIVACY_SWAP_FAILED",
        true,
      );
      return {
        ...result,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    }
  },
};
