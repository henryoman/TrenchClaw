import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signature,
  type AddressesByLookupTableAddress,
  type Instruction,
} from "@solana/kit";

import type { Action } from "../../../ai/contracts/types/action";
import type { ActionContext } from "../../../ai/contracts/types/context";
import type {
  JupiterBuildInstruction,
  JupiterBuildRequest,
  JupiterSwapAdapter,
} from "../../../solana/lib/jupiter/swap";
import { createRateLimitedSolanaRpc } from "../../../solana/lib/rpc/client";
import { MISSING_RPC_URL_ERROR, resolveRequiredRpcUrl } from "../../../solana/lib/rpc/urls";
import { registerTransactionForConfirmation } from "../ultra/confirmationTracker";
import {
  createActionFailure,
  createActionSuccess,
  getTakerFromContext,
  normalizeCoinToMint,
  resolveRawAmount,
  ultraQuoteInputSchema,
} from "../ultra/shared";

const COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111";
const COMPUTE_UNIT_LIMIT_MAX = 1_400_000;
const CONFIRMATION_POLL_INTERVAL_MS = 500;
const DEFAULT_CONFIRMATION_TIMEOUT_MS = 20_000;

interface StandardSwapContext extends ActionContext {
  jupiter?: JupiterSwapAdapter;
  ultraSigner?: {
    address?: string;
    signBase64Transaction: (base64Transaction: string) => Promise<string>;
  };
}

const standardSwapInputSchema = ultraQuoteInputSchema.extend({
  executeTimeoutMs: z.number().int().positive().max(60_000).optional(),
  slippageBps: z.number().int().min(0).max(10_000).optional(),
});

type StandardSwapInput = z.output<typeof standardSwapInputSchema>;

interface StandardSwapTimings {
  buildMs: number;
  simulateMs: number;
  signingMs: number;
  submitMs: number;
  confirmMs: number;
  totalMs: number;
}

interface StandardSwapTelemetry {
  requestId: string;
  walletAddress: string;
  inputMint: string;
  outputMint: string;
  amountLamports: string;
  slippageStrategy: "fixed-bps";
  feeStrategy: "self-rpc";
  quoteInAmount?: string;
  quoteOutAmount?: string;
  outAmount?: string;
  feeBps: number;
  note?: string;
  timings: StandardSwapTimings;
}

export interface StandardSwapOutput {
  requestId: string;
  signature?: string;
  status: string;
  outAmount?: string;
  feeBps: number;
  order: Record<string, unknown>;
  execute?: Record<string, unknown>;
  telemetry: StandardSwapTelemetry;
}

const getJupiterAdapter = (ctx: ActionContext): JupiterSwapAdapter => {
  const adapter = (ctx as StandardSwapContext).jupiter;
  if (!adapter) {
    throw new Error("Missing Jupiter Swap API adapter in action context (ctx.jupiter)");
  }
  return adapter;
};

const createInstruction = (instruction: JupiterBuildInstruction): Instruction => ({
  programAddress: address(instruction.programId),
  accounts: instruction.accounts.map((account) => ({
    address: address(account.pubkey),
    role:
      account.isSigner && account.isWritable
        ? AccountRole.WRITABLE_SIGNER
        : account.isSigner
          ? AccountRole.READONLY_SIGNER
          : account.isWritable
            ? AccountRole.WRITABLE
            : AccountRole.READONLY,
  })),
  data: new Uint8Array(Buffer.from(instruction.data, "base64")),
});

const createComputeUnitLimitInstruction = (units: number): Instruction => {
  const bytes = new Uint8Array(5);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, 2);
  view.setUint32(1, units, true);
  return {
    programAddress: address(COMPUTE_BUDGET_PROGRAM_ID),
    accounts: [],
    data: bytes,
  };
};

const transformBlockhash = (meta: {
  blockhash: number[];
  lastValidBlockHeight: number;
}) => {
  const blockhashBytes = Uint8Array.from(meta.blockhash);
  let blockhashValue: Parameters<typeof setTransactionMessageLifetimeUsingBlockhash>[0]["blockhash"];
  try {
    blockhashValue = getBase58Decoder().decode(blockhashBytes) as Parameters<
      typeof setTransactionMessageLifetimeUsingBlockhash
    >[0]["blockhash"];
  } catch {
    blockhashValue = new TextDecoder().decode(blockhashBytes) as Parameters<
      typeof setTransactionMessageLifetimeUsingBlockhash
    >[0]["blockhash"];
  }
  return {
    blockhash: blockhashValue,
    lastValidBlockHeight: BigInt(meta.lastValidBlockHeight),
  };
};

const transformLookupTables = (raw: Record<string, string[]> | null): AddressesByLookupTableAddress => {
  if (!raw) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(raw).map(([lookupTableAddress, addresses]) => [
      address(lookupTableAddress),
      addresses.map((entry) => address(entry)),
    ]),
  );
};

const buildVersionedTransaction = (input: {
  instructions: Instruction[];
  feePayer: string;
  blockhash: { blockhash: Parameters<typeof setTransactionMessageLifetimeUsingBlockhash>[0]["blockhash"]; lastValidBlockHeight: bigint };
  lookupTables: AddressesByLookupTableAddress;
}) =>
  pipe(
    createTransactionMessage({ version: 0 }),
    (message) => appendTransactionMessageInstructions(input.instructions, message),
    (message) => compressTransactionMessageUsingAddressLookupTables(message, input.lookupTables),
    (message) => setTransactionMessageFeePayer(address(input.feePayer), message),
    (message) => setTransactionMessageLifetimeUsingBlockhash(input.blockhash, message),
    (message) => compileTransaction(message),
  );

const waitForSignatureConfirmation = async (input: {
  rpc: ReturnType<typeof createRateLimitedSolanaRpc>;
  txSignature: string;
  timeoutMs: number;
  commitment?: "processed" | "confirmed" | "finalized";
}): Promise<void> => {
  const timeoutAt = Date.now() + input.timeoutMs;
  const requiredCommitment = input.commitment ?? "confirmed";
  const commitmentOrder = ["processed", "confirmed", "finalized"] as const;

  while (Date.now() < timeoutAt) {
    // Polling for confirmation is intentionally sequential.
    // eslint-disable-next-line no-await-in-loop
    const response = await input.rpc.getSignatureStatuses(
      [signature(input.txSignature)],
      { searchTransactionHistory: true },
    ).send();

    const status = response?.value?.[0];
    if (status?.err) {
      throw new Error(`Swap transaction ${input.txSignature} failed: ${JSON.stringify(status.err)}`);
    }

    const confirmationStatus = status?.confirmationStatus ?? null;
    if (
      confirmationStatus &&
      commitmentOrder.indexOf(confirmationStatus) >= commitmentOrder.indexOf(requiredCommitment)
    ) {
      return;
    }

    // eslint-disable-next-line no-await-in-loop
    await Bun.sleep(CONFIRMATION_POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for swap confirmation for signature ${input.txSignature}`);
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

export const executeSwapAction: Action<StandardSwapInput, StandardSwapOutput> = {
  name: "executeSwap",
  category: "wallet-based",
  subcategory: "swap",
  inputSchema: standardSwapInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();
    const timings: StandardSwapTimings = {
      buildMs: 0,
      simulateMs: 0,
      signingMs: 0,
      submitMs: 0,
      confirmMs: 0,
      totalMs: 0,
    };
    const timingStart = performance.now();

    try {
      if (input.mode === "ExactOut") {
        throw new Error("Jupiter Swap API /build is currently wired only for ExactIn managed swaps.");
      }
      if (input.referralAccount || typeof input.referralFee === "number") {
        throw new Error("Jupiter standard swaps do not support Ultra referral parameters on the managed swap surface.");
      }

      const adapter = getJupiterAdapter(ctx);
      const taker = input.taker ?? getTakerFromContext(ctx);
      if (!taker) {
        throw new Error("A taker wallet address is required for Jupiter standard swaps.");
      }

      const inputMint = normalizeCoinToMint(input.inputCoin, input.coinAliases);
      const outputMint = normalizeCoinToMint(input.outputCoin, input.coinAliases);
      const rawAmount = await resolveRawAmount(ctx, inputMint, taker, input.amount, input.amountUnit);

      const buildRequest: JupiterBuildRequest = {
        inputMint,
        outputMint,
        amount: rawAmount.toString(10),
        taker,
        slippageBps: input.slippageBps ?? 50,
      };

      const buildPhaseStart = performance.now();
      const build = await adapter.buildSwap(buildRequest);
      timings.buildMs = performance.now() - buildPhaseStart;

      const rpcUrl = resolveRequiredRpcUrl(ctx.rpcUrl);
      const rpc = createRateLimitedSolanaRpc(rpcUrl);
      const baseInstructions: Instruction[] = [
        ...build.setupInstructions.map(createInstruction),
        createInstruction(build.swapInstruction),
        ...(build.cleanupInstruction ? [createInstruction(build.cleanupInstruction)] : []),
        ...build.otherInstructions.map(createInstruction),
      ];
      const blockhash = transformBlockhash(build.blockhashWithMetadata);
      const lookupTables = transformLookupTables(build.addressesByLookupTableAddress);

      const simulationPhaseStart = performance.now();
      const simulationTransaction = buildVersionedTransaction({
        instructions: [createComputeUnitLimitInstruction(COMPUTE_UNIT_LIMIT_MAX), ...baseInstructions],
        feePayer: taker,
        blockhash,
        lookupTables,
      });
      const simulation = await rpc.simulateTransaction(
        getBase64EncodedWireTransaction(simulationTransaction),
        {
          encoding: "base64",
          commitment: "confirmed",
          replaceRecentBlockhash: true,
        },
      ).send();
      timings.simulateMs = performance.now() - simulationPhaseStart;

      if (simulation.value.err) {
        throw new Error(`Swap simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }

      const unitsConsumed = simulation.value.unitsConsumed == null ? null : Number(simulation.value.unitsConsumed);
      const estimatedComputeUnits = unitsConsumed
        ? Math.min(Math.ceil(unitsConsumed * 1.2), COMPUTE_UNIT_LIMIT_MAX)
        : COMPUTE_UNIT_LIMIT_MAX;

      const signingPhaseStart = performance.now();
      const finalTransaction = buildVersionedTransaction({
        instructions: [
          createComputeUnitLimitInstruction(estimatedComputeUnits),
          ...build.computeBudgetInstructions.map(createInstruction),
          ...baseInstructions,
        ],
        feePayer: taker,
        blockhash,
        lookupTables,
      });
      const signer = (ctx as StandardSwapContext).ultraSigner;
      if (!signer) {
        throw new Error("Missing signer in action context (ctx.ultraSigner) for Jupiter standard swap.");
      }
      const signedTransaction = await signer.signBase64Transaction(
        getBase64EncodedWireTransaction(finalTransaction),
      );
      timings.signingMs = performance.now() - signingPhaseStart;

      const submitPhaseStart = performance.now();
      const signatureValue = await rpc.sendTransaction(
        signedTransaction as ReturnType<typeof getBase64EncodedWireTransaction>,
        {
          encoding: "base64",
          skipPreflight: true,
          maxRetries: 3n,
        },
      ).send();
      const txSignature = String(signatureValue);
      timings.submitMs = performance.now() - submitPhaseStart;

      const confirmPhaseStart = performance.now();
      try {
        await waitForSignatureConfirmation({
          rpc,
          txSignature,
          timeoutMs: input.executeTimeoutMs ?? DEFAULT_CONFIRMATION_TIMEOUT_MS,
        });
        timings.confirmMs = performance.now() - confirmPhaseStart;
      } catch (error) {
        timings.confirmMs = performance.now() - confirmPhaseStart;
        if (error instanceof Error && error.message.includes("Timed out waiting for swap confirmation")) {
          registerTransactionForConfirmation({
            signature: txSignature,
            requestId: `standard-${idempotencyKey}`,
            rpcUrl,
            metadata: {
              idempotencyKey,
              provider: "standard",
              note: "standard-confirmation-timeout",
            },
          });

          timings.totalMs = performance.now() - timingStart;
          const telemetry: StandardSwapTelemetry = {
            requestId: `standard-${idempotencyKey}`,
            walletAddress: taker,
            inputMint,
            outputMint,
            amountLamports: rawAmount.toString(10),
            slippageStrategy: "fixed-bps",
            feeStrategy: "self-rpc",
            quoteInAmount: build.inAmount,
            quoteOutAmount: build.outAmount,
            outAmount: build.outAmount,
            feeBps: 0,
            note: "confirmation-timeout",
            timings,
          };

          return {
            ...createActionSuccess(idempotencyKey, {
              requestId: `standard-${idempotencyKey}`,
              signature: txSignature,
              status: "PendingTimeout",
              outAmount: build.outAmount,
              feeBps: 0,
              order: {
                request: buildRequest,
                build: toRecord(build.raw),
              },
              execute: {
                signature: txSignature,
                confirmationStatus: "pending-timeout",
                computeUnitLimit: estimatedComputeUnits,
                unitsConsumed,
              },
              telemetry,
            }, txSignature),
            durationMs: Date.now() - startedAt,
          };
        }
        throw error;
      }

      timings.totalMs = performance.now() - timingStart;
      const telemetry: StandardSwapTelemetry = {
        requestId: `standard-${idempotencyKey}`,
        walletAddress: taker,
        inputMint,
        outputMint,
        amountLamports: rawAmount.toString(10),
        slippageStrategy: "fixed-bps",
        feeStrategy: "self-rpc",
        quoteInAmount: build.inAmount,
        quoteOutAmount: build.outAmount,
        outAmount: build.outAmount,
        feeBps: 0,
        timings,
      };

      return {
        ...createActionSuccess(idempotencyKey, {
          requestId: `standard-${idempotencyKey}`,
          signature: txSignature,
          status: "Success",
          outAmount: build.outAmount,
          feeBps: 0,
          order: {
            request: buildRequest,
            build: toRecord(build.raw),
          },
          execute: {
            signature: txSignature,
            confirmationStatus: "confirmed",
            computeUnitLimit: estimatedComputeUnits,
            unitsConsumed,
          },
          telemetry,
        }, txSignature),
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = createActionFailure<StandardSwapOutput>(
        idempotencyKey,
        message,
        message !== MISSING_RPC_URL_ERROR,
        message === MISSING_RPC_URL_ERROR ? "MISSING_RPC_URL" : "STANDARD_SWAP_FAILED",
      );
      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    }
  },
};
