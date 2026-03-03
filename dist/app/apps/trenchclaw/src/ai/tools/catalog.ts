import type { Action } from "../runtime/types/action";
import { createBlockchainAlertAction } from "../../solana/actions/data-fetch/alerts/createBlockchainAlert";
import { pingRuntimeAction } from "../../solana/actions/data-fetch/runtime/pingRuntime";
import { queryRuntimeStoreAction } from "../../solana/actions/data-fetch/runtime/queryRuntimeStore";
import { upsertInstanceFactAction } from "../../solana/actions/data-fetch/runtime/upsertInstanceFact";
import { createWalletGroupDirectoryAction } from "../../solana/actions/wallet-based/create-wallets/createWalletGroupDirectory";
import { createWalletsAction } from "../../solana/actions/wallet-based/create-wallets/createWallets";
import { renameWalletsAction } from "../../solana/actions/wallet-based/create-wallets/renameWallets";
import { ultraExecuteSwapAction } from "../../solana/actions/wallet-based/swap/ultra/executeSwap";
import { ultraQuoteSwapAction } from "../../solana/actions/wallet-based/swap/ultra/quoteSwap";
import { ultraSwapAction } from "../../solana/actions/wallet-based/swap/ultra/swap";
import {
  privacyAirdropAction,
  privacySwapAction,
  privacyTransferAction,
} from "../../solana/actions/wallet-based/transfer/privacyCash";
import { transferAction } from "../../solana/actions/wallet-based/transfer/transfer";
import type { RuntimeSettings } from "../../runtime/load";

export type RuntimeAction = Action<any, any>;

interface RuntimeActionToolDefinition {
  action: RuntimeAction;
  includeInCatalog: (settings: RuntimeSettings) => boolean;
  enabledBySettings: (settings: RuntimeSettings) => boolean;
  requiresUserConfirmation?: boolean;
}

const canUseWalletSigningTransfers = (settings: RuntimeSettings): boolean =>
  settings.trading.enabled &&
  settings.wallet.dangerously.allowWalletSigning &&
  settings.trading.limits.maxSingleTransferSol > 0;

const canUseUltraSwap = (settings: RuntimeSettings): boolean =>
  settings.trading.enabled &&
  settings.trading.jupiter.ultra.enabled &&
  settings.trading.jupiter.ultra.allowQuotes &&
  settings.trading.jupiter.ultra.allowExecutions;

const runtimeActionToolCatalog: readonly RuntimeActionToolDefinition[] = [
  {
    action: createWalletGroupDirectoryAction,
    includeInCatalog: () => true,
    enabledBySettings: (settings) => settings.wallet.dangerously.allowCreatingWallets,
  },
  {
    action: createWalletsAction,
    includeInCatalog: () => true,
    enabledBySettings: (settings) => settings.wallet.dangerously.allowCreatingWallets,
  },
  {
    action: renameWalletsAction,
    includeInCatalog: () => true,
    enabledBySettings: (settings) => settings.wallet.dangerously.allowUpdatingWallets,
  },
  {
    action: queryRuntimeStoreAction,
    includeInCatalog: () => true,
    enabledBySettings: () => true,
  },
  {
    action: pingRuntimeAction,
    includeInCatalog: () => true,
    enabledBySettings: () => true,
  },
  {
    action: upsertInstanceFactAction,
    includeInCatalog: () => true,
    enabledBySettings: () => true,
  },
  {
    action: createBlockchainAlertAction,
    includeInCatalog: (settings) => settings.trading.enabled,
    enabledBySettings: (settings) => settings.trading.enabled,
  },
  {
    action: transferAction,
    includeInCatalog: (settings) => canUseWalletSigningTransfers(settings),
    enabledBySettings: (settings) => canUseWalletSigningTransfers(settings),
    requiresUserConfirmation: true,
  },
  {
    action: privacyTransferAction,
    includeInCatalog: (settings) => canUseWalletSigningTransfers(settings),
    enabledBySettings: (settings) => canUseWalletSigningTransfers(settings),
    requiresUserConfirmation: true,
  },
  {
    action: privacyAirdropAction,
    includeInCatalog: (settings) => canUseWalletSigningTransfers(settings),
    enabledBySettings: (settings) => canUseWalletSigningTransfers(settings),
    requiresUserConfirmation: true,
  },
  {
    action: ultraQuoteSwapAction,
    includeInCatalog: (settings) => settings.trading.enabled && settings.trading.jupiter.ultra.enabled,
    enabledBySettings: (settings) =>
      settings.trading.enabled && settings.trading.jupiter.ultra.enabled && settings.trading.jupiter.ultra.allowQuotes,
  },
  {
    action: ultraExecuteSwapAction,
    includeInCatalog: (settings) => settings.trading.enabled && settings.trading.jupiter.ultra.enabled,
    enabledBySettings: (settings) =>
      settings.trading.enabled &&
      settings.trading.jupiter.ultra.enabled &&
      settings.trading.jupiter.ultra.allowExecutions,
    requiresUserConfirmation: true,
  },
  {
    action: ultraSwapAction,
    includeInCatalog: (settings) => settings.trading.enabled && settings.trading.jupiter.ultra.enabled,
    enabledBySettings: (settings) => canUseUltraSwap(settings),
    requiresUserConfirmation: true,
  },
  {
    action: privacySwapAction,
    includeInCatalog: (settings) => canUseUltraSwap(settings) && canUseWalletSigningTransfers(settings),
    enabledBySettings: (settings) => canUseUltraSwap(settings) && canUseWalletSigningTransfers(settings),
    requiresUserConfirmation: true,
  },
];

export const getRuntimeActionCatalog = (settings: RuntimeSettings): RuntimeAction[] =>
  runtimeActionToolCatalog
    .filter((definition) => definition.includeInCatalog(settings))
    .map((definition) => definition.action);

export const isRuntimeActionEnabledBySettings = (settings: RuntimeSettings, actionName: string): boolean => {
  const definition = runtimeActionToolCatalog.find((entry) => entry.action.name === actionName);
  if (!definition) {
    return false;
  }
  return definition.enabledBySettings(settings);
};

export const getRuntimeActionsRequiringUserConfirmation = (): ReadonlySet<string> =>
  new Set(
    runtimeActionToolCatalog
      .filter((definition) => definition.requiresUserConfirmation)
      .map((definition) => definition.action.name),
  );
