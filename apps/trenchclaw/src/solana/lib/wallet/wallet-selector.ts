import { z } from "zod";

import {
  managedWalletRefSchema,
  walletGroupNameSchema,
  walletIdSchema,
  walletNameSchema,
} from "./wallet-types";
import { findManagedWalletEntry, readManagedWalletLibraryEntries } from "./wallet-manager";

const managedWalletSelectorObjectSchema = z
  .object({
    id: walletIdSchema.optional(),
    group: walletGroupNameSchema.optional(),
    name: walletNameSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.id && !value.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide wallet.id or wallet.name.",
        path: ["name"],
      });
    }

    if (value.group && !value.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "wallet.group requires wallet.name.",
        path: ["name"],
      });
    }
  });

export const managedWalletSelectorSchema = z.union([
  walletNameSchema.describe("Managed wallet name when it is unique within the active instance."),
  managedWalletSelectorObjectSchema,
]);

export type ManagedWalletSelector = z.output<typeof managedWalletSelectorSchema>;
export const managedWalletSelectorListSchema = z.array(managedWalletSelectorSchema).min(1).max(100);

export const managedWalletSelectionInputSchema = z
  .object({
    wallet: managedWalletSelectorSchema.optional(),
    walletGroup: walletGroupNameSchema.optional(),
    walletName: walletNameSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const hasLegacyGroup = typeof value.walletGroup === "string";
    const hasLegacyName = typeof value.walletName === "string";
    if ((hasLegacyGroup || hasLegacyName) && hasLegacyGroup !== hasLegacyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide walletGroup and walletName together.",
        path: hasLegacyGroup ? ["walletName"] : ["walletGroup"],
      });
    }
  });

export interface ManagedWalletSelectionInput {
  wallet?: ManagedWalletSelector;
  walletGroup?: string;
  walletName?: string;
}

export interface ManagedWalletSelectionListInput extends ManagedWalletSelectionInput {
  wallets?: ManagedWalletSelector[];
  walletNames?: string[];
}

const describeMatches = (matches: Array<{ walletGroup: string; walletName: string }>): string =>
  matches.map((entry) => `${entry.walletGroup}.${entry.walletName}`).join(", ");

export const resolveManagedWalletSelection = async (
  input: ManagedWalletSelectionInput,
): Promise<{ walletGroup: string; walletName: string } | null> => {
  const parsed = managedWalletSelectionInputSchema.parse(input);

  if (parsed.wallet) {
    if (typeof parsed.wallet === "string") {
      const { entries } = await readManagedWalletLibraryEntries({ allowMissing: true });
      const matches = entries.filter((entry) => entry.walletName === parsed.wallet);
      if (matches.length === 1) {
        return {
          walletGroup: matches[0]!.walletGroup,
          walletName: matches[0]!.walletName,
        };
      }
      if (matches.length > 1) {
        throw new Error(
          `Managed wallet name "${parsed.wallet}" is ambiguous. Use wallet.group too. Matches: ${describeMatches(matches)}`,
        );
      }
      throw new Error(`Managed wallet not found: ${parsed.wallet}`);
    }

    const walletSelector = parsed.wallet;

    if (walletSelector.id) {
      const { entries } = await readManagedWalletLibraryEntries({ allowMissing: true });
      const match = entries.find((entry) => entry.walletId === walletSelector.id);
      if (!match) {
        throw new Error(`Managed wallet not found: ${walletSelector.id}`);
      }
      return {
        walletGroup: match.walletGroup,
        walletName: match.walletName,
      };
    }

    if (walletSelector.group && walletSelector.name) {
      return managedWalletRefSchema.parse({
        walletGroup: walletSelector.group,
        walletName: walletSelector.name,
      });
    }

    if (walletSelector.name) {
      const { entries } = await readManagedWalletLibraryEntries({ allowMissing: true });
      const matches = entries.filter((entry) => entry.walletName === walletSelector.name);
      if (matches.length === 1) {
        return {
          walletGroup: matches[0]!.walletGroup,
          walletName: matches[0]!.walletName,
        };
      }
      if (matches.length > 1) {
        throw new Error(
          `Managed wallet name "${walletSelector.name}" is ambiguous. Use wallet.group too. Matches: ${describeMatches(matches)}`,
        );
      }
      throw new Error(`Managed wallet not found: ${walletSelector.name}`);
    }
  }

  if (parsed.walletGroup && parsed.walletName) {
    return managedWalletRefSchema.parse({
      walletGroup: parsed.walletGroup,
      walletName: parsed.walletName,
    });
  }

  return null;
};

export const findManagedWalletEntryBySelection = async (
  input: ManagedWalletSelectionInput,
) => {
  const resolved = await resolveManagedWalletSelection(input);
  if (!resolved) {
    return null;
  }
  return await findManagedWalletEntry(resolved);
};

const resolveSelectorToEntry = async (
  selector: ManagedWalletSelector,
  entries: Awaited<ReturnType<typeof readManagedWalletLibraryEntries>>["entries"],
) => {
  if (typeof selector === "string") {
    const matches = entries.filter((entry) => entry.walletName === selector);
    if (matches.length === 1) {
      return matches[0]!;
    }
    if (matches.length > 1) {
      throw new Error(
        `Managed wallet name "${selector}" is ambiguous. Use wallet.group too. Matches: ${describeMatches(matches)}`,
      );
    }
    throw new Error(`Managed wallet not found: ${selector}`);
  }

  if (selector.id) {
    const match = entries.find((entry) => entry.walletId === selector.id);
    if (!match) {
      throw new Error(`Managed wallet not found: ${selector.id}`);
    }
    return match;
  }

  if (selector.group && selector.name) {
    const match = entries.find((entry) => entry.walletGroup === selector.group && entry.walletName === selector.name);
    if (!match) {
      throw new Error(`Managed wallet not found: ${selector.group}.${selector.name}`);
    }
    return match;
  }

  if (selector.name) {
    const matches = entries.filter((entry) => entry.walletName === selector.name);
    if (matches.length === 1) {
      return matches[0]!;
    }
    if (matches.length > 1) {
      throw new Error(
        `Managed wallet name "${selector.name}" is ambiguous. Use wallet.group too. Matches: ${describeMatches(matches)}`,
      );
    }
    throw new Error(`Managed wallet not found: ${selector.name}`);
  }

  throw new Error("Managed wallet selector is invalid");
};

export const resolveManagedWalletEntriesBySelection = async (
  input: ManagedWalletSelectionListInput,
) => {
  const selectors = [
    ...(input.wallet ? [input.wallet] : []),
    ...(input.wallets ?? []),
  ];
  if (selectors.length === 0) {
    return null;
  }

  const { entries } = await readManagedWalletLibraryEntries({ allowMissing: true });
  const resolvedEntries = await Promise.all(selectors.map(async (selector) => await resolveSelectorToEntry(selector, entries)));
  const deduped = new Map<string, (typeof resolvedEntries)[number]>();
  for (const entry of resolvedEntries) {
    deduped.set(entry.walletId, entry);
  }
  return [...deduped.values()];
};
