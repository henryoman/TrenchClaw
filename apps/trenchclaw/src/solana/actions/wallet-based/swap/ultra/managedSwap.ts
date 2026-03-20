import { z } from "zod";

import type { Action } from "../../../../../ai/runtime/types/action";
import { managedWalletSelectorSchema, resolveManagedWalletSelection } from "../../../../lib/wallet/wallet-selector";
import { loadManagedWalletSigner } from "../../../../lib/wallet/wallet-signer";
import { walletGroupNameSchema } from "../../../../lib/wallet/wallet-types";
import { ultraQuoteInputSchema } from "./shared";
import { ultraSwapAction, type UltraSwapOutput } from "./swap";

const walletNameSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]+$/);

const managedUltraSwapInputSchema = ultraQuoteInputSchema.extend({
  wallet: managedWalletSelectorSchema.optional(),
  walletGroup: walletGroupNameSchema.optional(),
  walletName: walletNameSchema.optional(),
  swapType: z.literal("ultra").default("ultra"),
  executeTimeoutMs: z.number().int().positive().max(60_000).optional(),
}).superRefine((value, ctx) => {
  const hasWalletGroup = typeof value.walletGroup === "string";
  const hasWalletName = typeof value.walletName === "string";
  if (!value.wallet && !hasWalletGroup && !hasWalletName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide wallet or walletGroup and walletName.",
      path: ["wallet"],
    });
  }
  if ((hasWalletGroup || hasWalletName) && hasWalletGroup !== hasWalletName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide walletGroup and walletName together.",
      path: hasWalletGroup ? ["walletName"] : ["walletGroup"],
    });
  }
});

type ManagedUltraSwapInput = z.infer<typeof managedUltraSwapInputSchema>;

export const managedUltraSwapAction: Action<ManagedUltraSwapInput, UltraSwapOutput> = {
  name: "managedUltraSwap",
  category: "wallet-based",
  subcategory: "swap",
  inputSchema: managedUltraSwapInputSchema,
  async execute(ctx, input) {
    const managedWallet = await resolveManagedWalletSelection(input);
    if (!managedWallet) {
      throw new Error("Managed wallet is required for managedUltraSwap");
    }

    const signer = await loadManagedWalletSigner({
      walletGroup: managedWallet.walletGroup,
      walletName: managedWallet.walletName,
      rpcUrl: ctx.rpcUrl,
    });

    if (input.taker && input.taker !== signer.address) {
      throw new Error(
        `Managed wallet taker mismatch for ${managedWallet.walletGroup}.${managedWallet.walletName}: expected ${signer.address}, received ${input.taker}`,
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
