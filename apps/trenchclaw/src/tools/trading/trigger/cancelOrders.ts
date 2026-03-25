import { z } from "zod";

import type { Action } from "../../../ai/contracts/types/action";
import { managedWalletSelectorSchema, resolveManagedWalletSelection } from "../../../solana/lib/wallet/wallet-selector";
import { loadManagedWalletSigner } from "../../../solana/lib/wallet/wallet-signer";
import { walletGroupNameSchema, walletNameSchema } from "../../../solana/lib/wallet/wallet-types";
import { extractSignatureFromSignedTransaction } from "../../../solana/lib/jupiter/parsing";
import {
  createActionFailure,
  createActionSuccess,
  resolveMakerAddress,
  resolveTriggerAdapter,
  signTriggerTransactionIfNeeded,
} from "./shared";

const triggerCancelOrdersInputSchema = z.object({
  maker: z.string().trim().min(1).optional(),
  orders: z.array(z.string().trim().min(1)).min(1),
  computeUnitPrice: z.string().trim().min(1).optional(),
});

type TriggerCancelOrdersInput = z.output<typeof triggerCancelOrdersInputSchema>;

export interface TriggerCancelOrdersOutput {
  requestId: string;
  cancelledOrders: string[];
  signatures: string[];
  execute: Array<Record<string, unknown>>;
  rawCancel: Record<string, unknown>;
}

export const triggerCancelOrdersAction: Action<
  TriggerCancelOrdersInput,
  TriggerCancelOrdersOutput
> = {
  name: "triggerCancelOrders",
  category: "wallet-based",
  subcategory: "swap",
  inputSchema: triggerCancelOrdersInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const adapter = await resolveTriggerAdapter(ctx);
      const maker = resolveMakerAddress(ctx, input);
      const cancelPayload = await adapter.cancelOrders({
        maker,
        orders: input.orders,
        computeUnitPrice: input.computeUnitPrice,
      });

      const signatures: string[] = [];
      const executePayloads: Array<Record<string, unknown>> = [];

      // Keep cancel execution order stable across returned transactions.
      for (const transaction of cancelPayload.transactions) {
        // eslint-disable-next-line no-await-in-loop
        const signedTransaction = await signTriggerTransactionIfNeeded(ctx, {
          transaction,
        });
        // eslint-disable-next-line no-await-in-loop
        const execute = await adapter.executeOrder({
          requestId: cancelPayload.requestId,
          signedTransaction,
        });
        const signature = execute.signature ?? extractSignatureFromSignedTransaction(signedTransaction);
        if (signature) {
          signatures.push(signature);
        }
        executePayloads.push(
          execute.raw && typeof execute.raw === "object" ? (execute.raw as Record<string, unknown>) : {},
        );
      }

      const result = createActionSuccess<TriggerCancelOrdersOutput>(
        idempotencyKey,
        {
          requestId: cancelPayload.requestId,
          cancelledOrders: [...input.orders],
          signatures,
          execute: executePayloads,
          rawCancel: cancelPayload.raw && typeof cancelPayload.raw === "object" ? (cancelPayload.raw as Record<string, unknown>) : {},
        },
        signatures[0],
      );
      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const result = createActionFailure<TriggerCancelOrdersOutput>(
        idempotencyKey,
        error instanceof Error ? error.message : String(error),
        false,
        "TRIGGER_CANCEL_ORDERS_FAILED",
      );
      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    }
  },
};

const managedTriggerCancelOrdersInputSchema = triggerCancelOrdersInputSchema.extend({
  wallet: managedWalletSelectorSchema.optional(),
  walletGroup: walletGroupNameSchema.optional(),
  walletName: walletNameSchema.optional(),
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

type ManagedTriggerCancelOrdersInput = z.infer<typeof managedTriggerCancelOrdersInputSchema>;

export const managedTriggerCancelOrdersAction: Action<
  ManagedTriggerCancelOrdersInput,
  TriggerCancelOrdersOutput
> = {
  name: "managedTriggerCancelOrders",
  category: "wallet-based",
  subcategory: "swap",
  inputSchema: managedTriggerCancelOrdersInputSchema,
  async execute(ctx, input) {
    const managedWallet = await resolveManagedWalletSelection(input);
    if (!managedWallet) {
      throw new Error("Managed wallet is required for managedTriggerCancelOrders");
    }

    const signer = await loadManagedWalletSigner({
      walletGroup: managedWallet.walletGroup,
      walletName: managedWallet.walletName,
      rpcUrl: ctx.rpcUrl,
    });

    return await triggerCancelOrdersAction.execute(
      {
        ...ctx,
        wallet: signer.address,
        ultraSigner: signer,
      },
      {
        maker: signer.address,
        orders: input.orders,
        computeUnitPrice: input.computeUnitPrice,
      },
    );
  },
};
