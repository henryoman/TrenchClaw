import { z } from "zod";

import type { Action } from "../../../../../ai/runtime/types/action";
import { managedWalletSelectorSchema, resolveManagedWalletSelection } from "../../../../lib/wallet/wallet-selector";
import { loadManagedWalletSigner } from "../../../../lib/wallet/wallet-signer";
import { walletGroupNameSchema, walletNameSchema } from "../../../../lib/wallet/wallet-types";
import { triggerOrderAction, type TriggerOrderOutput } from "./createOrder";
import { triggerBasisSourceSchema, triggerDirectionSchema, triggerSpecSchema } from "./shared";

const managedTriggerOrderInputSchema = z.object({
  wallet: managedWalletSelectorSchema.optional(),
  walletGroup: walletGroupNameSchema.optional(),
  walletName: walletNameSchema.optional(),
  inputCoin: z.string().trim().min(1),
  outputCoin: z.string().trim().min(1),
  amount: z.union([z.number().positive(), z.string().trim().min(1)]),
  amountUnit: z.enum(["ui", "native", "percent"]).optional(),
  direction: triggerDirectionSchema,
  trigger: triggerSpecSchema,
  buyPrice: z.union([z.number().positive(), z.string().trim().min(1)]).optional(),
  buyPriceSource: triggerBasisSourceSchema.optional(),
  coinAliases: z.record(z.string(), z.string()).optional(),
  computeUnitPrice: z.string().trim().min(1).optional(),
  expiresAtUnixMs: z.number().int().positive().optional(),
  userConfirmationToken: z.string().trim().min(1).optional(),
  confirmedByUser: z.boolean().optional(),
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

type ManagedTriggerOrderInput = z.infer<typeof managedTriggerOrderInputSchema>;

export const managedTriggerOrderAction: Action<
  ManagedTriggerOrderInput,
  TriggerOrderOutput
> = {
  name: "managedTriggerOrder",
  category: "wallet-based",
  subcategory: "swap",
  inputSchema: managedTriggerOrderInputSchema,
  async execute(ctx, input) {
    const managedWallet = await resolveManagedWalletSelection(input);
    if (!managedWallet) {
      throw new Error("Managed wallet is required for managedTriggerOrder");
    }

    const signer = await loadManagedWalletSigner({
      walletGroup: managedWallet.walletGroup,
      walletName: managedWallet.walletName,
      rpcUrl: ctx.rpcUrl,
    });

    return await triggerOrderAction.execute(
      {
        ...ctx,
        wallet: signer.address,
        ultraSigner: signer,
      },
      {
        maker: signer.address,
        payer: signer.address,
        inputCoin: input.inputCoin,
        outputCoin: input.outputCoin,
        amount: input.amount,
        amountUnit: input.amountUnit,
        direction: input.direction,
        trigger: input.trigger,
        buyPrice: input.buyPrice,
        buyPriceSource: input.buyPriceSource,
        coinAliases: input.coinAliases,
        computeUnitPrice: input.computeUnitPrice,
        expiresAtUnixMs: input.expiresAtUnixMs,
      },
    );
  },
};
