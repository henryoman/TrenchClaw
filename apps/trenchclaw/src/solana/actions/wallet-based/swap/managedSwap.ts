import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import { loadRuntimeSettings } from "../../../../runtime/load";
import {
  managedUltraSwapAction,
  managedUltraSwapInputSchema,
  type ManagedUltraSwapInput,
} from "./ultra/managedSwap";
import type { UltraSwapOutput } from "./ultra/swap";

const managedSwapInputSchema = managedUltraSwapInputSchema.extend({
  provider: z.enum(["configured", "ultra"]).default("configured"),
});

type ManagedSwapInput = z.infer<typeof managedSwapInputSchema>;
type ManagedSwapOutput = UltraSwapOutput & {
  provider: "ultra";
};

const omitProvider = (input: ManagedSwapInput): ManagedUltraSwapInput => {
  const { provider: _provider, ...rest } = input;
  return rest;
};

const resolveManagedSwapProvider = async (
  requestedProvider: ManagedSwapInput["provider"],
): Promise<"ultra"> => {
  if (requestedProvider === "ultra") {
    return "ultra";
  }

  const settings = await loadRuntimeSettings();
  if (settings.trading.preferences.defaultSwapProvider === "ultra") {
    return "ultra";
  }

  throw new Error(
    `Configured swap provider "${settings.trading.preferences.defaultSwapProvider}" is not implemented for managedSwap yet.`,
  );
};

export const managedSwapAction: Action<ManagedSwapInput, ManagedSwapOutput> = {
  name: "managedSwap",
  category: "wallet-based",
  subcategory: "swap",
  inputSchema: managedSwapInputSchema,
  async execute(ctx, input) {
    const provider = await resolveManagedSwapProvider(input.provider);
    if (provider !== "ultra") {
      throw new Error(`Unsupported managed swap provider "${provider}"`);
    }

    const result = await managedUltraSwapAction.execute(ctx, omitProvider(input));
    if (!result.ok || !result.data) {
      return result;
    }

    return {
      ...result,
      data: {
        provider,
        ...result.data,
      },
    };
  },
};
