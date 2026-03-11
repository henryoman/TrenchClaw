import { z } from "zod";

import type { Action } from "../../../../../ai/runtime/types/action";
import { createUltraSignerAdapter } from "../../../../lib/adapters/ultra-signer";
import {
  resolveWalletLibraryFilePath,
  walletGroupNameSchema,
} from "../../create-wallets/wallet-storage";
import { ultraQuoteInputSchema } from "./shared";
import { ultraSwapAction, type UltraSwapOutput } from "./swap";

const walletNameSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]+$/);

const managedUltraSwapInputSchema = ultraQuoteInputSchema.and(
  z.object({
    walletGroup: walletGroupNameSchema,
    walletName: walletNameSchema,
    swapType: z.literal("ultra").default("ultra"),
    slippageBps: z.number().int().positive().max(10_000).optional(),
    executeTimeoutMs: z.number().int().positive().max(60_000).optional(),
  }),
);

type ManagedUltraSwapInput = z.infer<typeof managedUltraSwapInputSchema>;

export const managedUltraSwapAction: Action<ManagedUltraSwapInput, UltraSwapOutput> = {
  name: "managedUltraSwap",
  category: "wallet-based",
  subcategory: "swap",
  inputSchema: managedUltraSwapInputSchema,
  async execute(ctx, input) {
    const signer = await loadManagedWalletSigner(input.walletGroup, input.walletName, ctx.rpcUrl);

    if (input.taker && input.taker !== signer.address) {
      throw new Error(
        `Managed wallet taker mismatch for ${input.walletGroup}.${input.walletName}: expected ${signer.address}, received ${input.taker}`,
      );
    }

    const result = await ultraSwapAction.execute(
      {
        ...ctx,
        wallet: signer.address,
        ultraSigner: signer,
      },
      {
        inputCoin: input.inputCoin,
        outputCoin: input.outputCoin,
        amount: input.amount,
        amountUnit: input.amountUnit,
        mode: input.mode,
        slippageBps: input.slippageBps,
        executeTimeoutMs: input.executeTimeoutMs,
        referralAccount: input.referralAccount,
        referralFee: input.referralFee,
        coinAliases: input.coinAliases,
        taker: signer.address,
      },
    );

    return result;
  },
};

async function loadManagedWalletSigner(walletGroup: string, walletName: string, rpcUrl?: string) {
  const walletLibraryFile = Bun.file(resolveWalletLibraryFilePath());
  if (!(await walletLibraryFile.exists())) {
    throw new Error("Managed wallet library file not found");
  }

  const walletLibraryText = await walletLibraryFile.text();
  const walletEntry = walletLibraryText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid managed wallet library JSON on line ${index + 1}: ${message}`, { cause: error });
      }
    })
    .find((entry) => entry.walletGroup === walletGroup && entry.walletName === walletName);

  const walletFilePath =
    walletEntry && typeof walletEntry.keypairFilePath === "string" ? walletEntry.keypairFilePath : null;
  if (!walletFilePath) {
    throw new Error(`Managed wallet keypair file not found in wallet library for ${walletGroup}.${walletName}`);
  }

  const walletFile = Bun.file(walletFilePath);

  if (!(await walletFile.exists())) {
    throw new Error(`Managed wallet keypair file not found: ${walletFilePath}`);
  }

  const parsed = await walletFile.json();
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((entry) => Number.isInteger(entry))) {
    throw new Error(`Managed wallet keypair file is invalid: ${walletFilePath}`);
  }

  return createUltraSignerAdapter({
    privateKey: new Uint8Array(parsed as number[]),
    rpcUrl,
  });
}
