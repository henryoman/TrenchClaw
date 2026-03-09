import path from "node:path";
import { z } from "zod";

import type { Action } from "../../../../../ai/runtime/types/action";
import { createUltraSignerAdapter } from "../../../../lib/adapters/ultra-signer";
import {
  resolveWalletGroupDirectoryPath,
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
    const signer = await loadManagedWalletSigner(input.walletGroup, input.walletName);

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

async function loadManagedWalletSigner(walletGroup: string, walletName: string) {
  const walletFilePath = path.join(resolveWalletGroupDirectoryPath(walletGroup), `${walletName}.json`);
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
    rpcUrl: process.env.RPC_URL,
  });
}
