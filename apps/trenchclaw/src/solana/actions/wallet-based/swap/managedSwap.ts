import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import type { ActionResult } from "../../../../ai/runtime/types/action";
import type { ActionContext } from "../../../../ai/runtime/types/context";
import { loadRuntimeSettings } from "../../../../runtime/load";
import {
  managedUltraSwapAction,
  managedUltraSwapInputSchema,
  type ManagedUltraSwapInput,
} from "./ultra/managedSwap";
import { executeSwapAction, type StandardSwapOutput } from "./rpc/executeSwap";
import type { UltraSwapOutput } from "./ultra/swap";
import { resolveManagedWalletSelection } from "../../../lib/wallet/wallet-selector";
import { loadManagedWalletSigner } from "../../../lib/wallet/wallet-signer";

const managedSwapInputSchema = managedUltraSwapInputSchema.extend({
  provider: z.enum(["configured", "ultra", "standard"]).default("configured"),
});

type ManagedSwapInput = z.infer<typeof managedSwapInputSchema>;
type ManagedSwapOutput =
  | (UltraSwapOutput & { provider: "ultra" })
  | (StandardSwapOutput & { provider: "standard" });

const omitProvider = (input: ManagedSwapInput): ManagedUltraSwapInput => {
  const { provider: _provider, ...rest } = input;
  return rest;
};

const resolveManagedSwapProvider = async (
  requestedProvider: ManagedSwapInput["provider"],
): Promise<"ultra" | "standard"> => {
  const settings = await loadRuntimeSettings();

  if (requestedProvider === "ultra") {
    if (!settings.trading.jupiter.ultra.enabled || !settings.trading.jupiter.ultra.allowExecutions) {
      throw new Error("Jupiter Ultra swaps are disabled by runtime settings.");
    }
    return "ultra";
  }

  if (requestedProvider === "standard") {
    if (!settings.trading.jupiter.standard.enabled || !settings.trading.jupiter.standard.allowExecutions) {
      throw new Error("Jupiter standard swaps are disabled by runtime settings.");
    }
    return "standard";
  }

  if (settings.trading.preferences.defaultSwapProvider === "ultra") {
    if (!settings.trading.jupiter.ultra.enabled || !settings.trading.jupiter.ultra.allowExecutions) {
      throw new Error("Configured Jupiter Ultra swaps are disabled by runtime settings.");
    }
    return "ultra";
  }

  if (!settings.trading.jupiter.standard.enabled || !settings.trading.jupiter.standard.allowExecutions) {
    throw new Error("Configured Jupiter standard swaps are disabled by runtime settings.");
  }

  return "standard";
};

const isUltraQuoteFailureMessage = (message: string): boolean =>
  message.includes("Failed to get quotes");

const tryStandardSwapAfterUltraQuoteFailure = async (
  ctx: ActionContext,
  input: ManagedSwapInput,
  ultraResult: ActionResult<UltraSwapOutput>,
): Promise<ActionResult<ManagedSwapOutput> | null> => {
  if (input.provider !== "configured" || ultraResult.ok) {
    return null;
  }
  const message = ultraResult.error ?? "";
  if (!isUltraQuoteFailureMessage(message)) {
    return null;
  }

  const settings = await loadRuntimeSettings();
  if (!settings.trading.jupiter.standard.enabled || !settings.trading.jupiter.standard.allowExecutions) {
    return null;
  }

  const standardResult = await executeManagedStandardSwap(ctx, input);
  if (!standardResult.ok || !standardResult.data) {
    return {
      ...standardResult,
      error: standardResult.error
        ? `${message} (Ultra). Standard fallback: ${standardResult.error}`
        : message,
    };
  }

  return {
    ...standardResult,
    data: {
      provider: "standard" as const,
      ...standardResult.data,
    },
  };
};

export const managedSwapAction: Action<ManagedSwapInput, ManagedSwapOutput> = {
  name: "managedSwap",
  category: "wallet-based",
  subcategory: "swap",
  inputSchema: managedSwapInputSchema,
  async execute(ctx, input) {
    const provider = await resolveManagedSwapProvider(input.provider);
    if (provider === "ultra") {
      const result = await managedUltraSwapAction.execute(ctx, omitProvider(input));
      if (result.ok && result.data) {
        return {
          ...result,
          data: {
            provider: "ultra" as const,
            ...result.data,
          },
        };
      }

      const fallback = await tryStandardSwapAfterUltraQuoteFailure(ctx, input, result);
      if (fallback) {
        return fallback;
      }

      return {
        ...result,
        data: undefined,
      };
    }

    const result = await executeManagedStandardSwap(ctx, input);
    if (!result.ok || !result.data) {
      return {
        ...result,
        data: undefined,
      };
    }

    return {
      ...result,
      data: {
        provider: "standard" as const,
        ...result.data,
      },
    };
  },
};

const executeManagedStandardSwap = async (
  ctx: ActionContext,
  input: ManagedSwapInput,
) => {
  const managedWallet = await resolveManagedWalletSelection(input);
  if (!managedWallet) {
    throw new Error("Managed wallet is required for managedSwap");
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

  return executeSwapAction.execute(
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
      executeTimeoutMs: input.executeTimeoutMs,
      coinAliases: input.coinAliases,
      taker: signer.address,
      mode: input.mode,
    },
  );
};
