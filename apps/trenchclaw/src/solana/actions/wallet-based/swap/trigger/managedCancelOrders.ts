import { z } from "zod";

import type { Action } from "../../../../../ai/runtime/types/action";
import { loadManagedWalletSigner } from "../../../../lib/wallet/wallet-signer";
import { walletGroupNameSchema } from "../../../../lib/wallet/wallet-types";
import { triggerCancelOrdersAction, type TriggerCancelOrdersOutput } from "./cancelOrders";
import { triggerCancelOrdersInputSchema } from "./shared";

const walletNameSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]+$/);

const managedTriggerCancelOrdersInputSchema = triggerCancelOrdersInputSchema.and(
  z.object({
    walletGroup: walletGroupNameSchema,
    walletName: walletNameSchema,
  }),
);

type ManagedTriggerCancelOrdersInput = z.infer<typeof managedTriggerCancelOrdersInputSchema>;

export const managedTriggerCancelOrdersAction: Action<ManagedTriggerCancelOrdersInput, TriggerCancelOrdersOutput> = {
  name: "managedTriggerCancelOrders",
  category: "wallet-based",
  subcategory: "trigger",
  inputSchema: managedTriggerCancelOrdersInputSchema,
  async execute(ctx, input) {
    const { walletGroup, walletName, ...cancelInput } = input;
    const signer = await loadManagedWalletSigner({
      walletGroup,
      walletName,
      rpcUrl: ctx.rpcUrl,
    });

    if (cancelInput.maker && cancelInput.maker !== signer.address) {
      throw new Error(
        `Managed wallet maker mismatch for ${walletGroup}.${walletName}: expected ${signer.address}, received ${cancelInput.maker}`,
      );
    }

    return triggerCancelOrdersAction.execute(
      {
        ...ctx,
        wallet: signer.address,
        ultraSigner: signer,
      },
      {
        ...cancelInput,
        maker: signer.address,
      },
    );
  },
};
