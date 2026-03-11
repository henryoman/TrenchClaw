import { z } from "zod";

import type { Action } from "../../../../../ai/runtime/types/action";
import { loadManagedWalletSigner } from "../../../../lib/wallet/wallet-signer";
import { walletGroupNameSchema } from "../../../../lib/wallet/wallet-types";
import { ultraQuoteInputSchema } from "./shared";
import { ultraSwapAction, type UltraSwapOutput } from "./swap";

const walletNameSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]+$/);

const managedUltraSwapInputSchema = ultraQuoteInputSchema.and(
  z.object({
    walletGroup: walletGroupNameSchema,
    walletName: walletNameSchema,
    swapType: z.literal("ultra").default("ultra"),
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
    const signer = await loadManagedWalletSigner({
      walletGroup: input.walletGroup,
      walletName: input.walletName,
      rpcUrl: ctx.rpcUrl,
    });

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
