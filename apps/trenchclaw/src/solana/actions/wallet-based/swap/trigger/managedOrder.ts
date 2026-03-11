import { z } from "zod";

import type { Action } from "../../../../../ai/runtime/types/action";
import { loadManagedWalletSigner } from "../../../../lib/wallet/wallet-signer";
import { walletGroupNameSchema } from "../../../../lib/wallet/wallet-types";
import { triggerOrderAction, type TriggerOrderOutput } from "./order";
import { triggerCreateOrderInputSchema } from "./shared";

const walletNameSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]+$/);

const managedTriggerOrderInputSchema = triggerCreateOrderInputSchema.and(
  z.object({
    walletGroup: walletGroupNameSchema,
    walletName: walletNameSchema,
  }),
);

type ManagedTriggerOrderInput = z.infer<typeof managedTriggerOrderInputSchema>;

export const managedTriggerOrderAction: Action<ManagedTriggerOrderInput, TriggerOrderOutput> = {
  name: "managedTriggerOrder",
  category: "wallet-based",
  subcategory: "trigger",
  inputSchema: managedTriggerOrderInputSchema,
  async execute(ctx, input) {
    const { walletGroup, walletName, ...triggerInput } = input;
    const signer = await loadManagedWalletSigner({
      walletGroup,
      walletName,
      rpcUrl: ctx.rpcUrl,
    });

    if (triggerInput.maker && triggerInput.maker !== signer.address) {
      throw new Error(
        `Managed wallet maker mismatch for ${walletGroup}.${walletName}: expected ${signer.address}, received ${triggerInput.maker}`,
      );
    }

    if (triggerInput.payer && triggerInput.payer !== signer.address) {
      throw new Error(
        `Managed wallet payer mismatch for ${walletGroup}.${walletName}: expected ${signer.address}, received ${triggerInput.payer}`,
      );
    }

    return triggerOrderAction.execute(
      {
        ...ctx,
        wallet: signer.address,
        ultraSigner: signer,
      },
      {
        ...triggerInput,
        maker: signer.address,
        payer: signer.address,
      },
    );
  },
};
