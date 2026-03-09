import { createBlockchainAlertAction } from "../../solana/actions/data-fetch/alerts/createBlockchainAlert";
import { mutateInstanceMemoryAction } from "../../solana/actions/data-fetch/runtime/mutateInstanceMemory";
import { pingRuntimeAction } from "../../solana/actions/data-fetch/runtime/pingRuntime";
import { queryInstanceMemoryAction } from "../../solana/actions/data-fetch/runtime/queryInstanceMemory";
import { queryRuntimeStoreAction } from "../../solana/actions/data-fetch/runtime/queryRuntimeStore";
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
import type { RuntimeActionCapabilityDefinition } from "./types";

const canUseWalletSigningTransfers = ({ settings }: { settings: Parameters<RuntimeActionCapabilityDefinition["enabledBySettings"]>[0]["settings"] }): boolean =>
  settings.trading.enabled &&
  settings.wallet.dangerously.allowWalletSigning &&
  settings.trading.limits.maxSingleTransferSol > 0;

const canUseUltraSwap = ({ settings }: { settings: Parameters<RuntimeActionCapabilityDefinition["enabledBySettings"]>[0]["settings"] }): boolean =>
  settings.trading.enabled &&
  settings.trading.jupiter.ultra.enabled &&
  settings.trading.jupiter.ultra.allowQuotes &&
  settings.trading.jupiter.ultra.allowExecutions;

export const runtimeActionCapabilityDefinitions: readonly RuntimeActionCapabilityDefinition[] = [
  {
    kind: "action",
    action: createWalletGroupDirectoryAction,
    description: "Create a protected wallet group directory inside the runtime wallet library.",
    purpose: "Prepare a named wallet container before creating or organizing wallets.",
    tags: ["wallets", "filesystem", "setup"],
    exampleInput: {
      walletGroup: "ops/market-makers",
    },
    includeInCatalog: () => true,
    enabledBySettings: ({ settings }) => settings.wallet.dangerously.allowCreatingWallets,
    chatExposed: true,
  },
  {
    kind: "action",
    action: createWalletsAction,
    description: "Create one or more filesystem wallets inside a single wallet group directory.",
    purpose: "Provision fresh wallets with one sidecar label file per wallet.",
    tags: ["wallets", "setup", "keys"],
    exampleInput: {
      count: 2,
      storage: {
        walletGroup: "ops-market-makers",
        createGroupIfMissing: true,
      },
      output: {
        filePrefix: "mm",
        startIndex: 1,
        includeIndexInFileName: true,
      },
    },
    includeInCatalog: () => true,
    enabledBySettings: ({ settings }) => settings.wallet.dangerously.allowCreatingWallets,
    chatExposed: true,
  },
  {
    kind: "action",
    action: renameWalletsAction,
    description: "Rename wallet entries and optionally keep keypair files aligned with the new names.",
    purpose: "Clean up or reorganize existing managed wallet inventories.",
    tags: ["wallets", "maintenance"],
    exampleInput: {
      walletGroup: "ops-market-makers",
      renames: [
        {
          fromWalletName: "mm001",
          toWalletName: "mm-hot-001",
        },
      ],
    },
    includeInCatalog: () => true,
    enabledBySettings: ({ settings }) => settings.wallet.dangerously.allowUpdatingWallets,
    chatExposed: true,
  },
  {
    kind: "action",
    action: queryRuntimeStoreAction,
    description: "Read conversations, jobs, receipts, runtime search results, and other durable runtime state.",
    purpose: "Inspect runtime history and state without mutating it.",
    tags: ["runtime", "search", "state", "read"],
    exampleInput: {
      request: {
        type: "getRuntimeKnowledgeSurface",
      },
    },
    includeInCatalog: () => true,
    enabledBySettings: () => true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: queryInstanceMemoryAction,
    description: "Read instance-scoped profile and durable fact memory.",
    purpose: "Fetch stable preferences, notes, and granular memory for the active or requested instance.",
    tags: ["memory", "profile", "facts", "read"],
    exampleInput: {
      request: {
        type: "getBundle",
        instanceId: "instance-1",
      },
    },
    includeInCatalog: () => true,
    enabledBySettings: () => true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: mutateInstanceMemoryAction,
    description: "Write instance-scoped profile fields and durable facts.",
    purpose: "Store operator preferences and other persistent memory in the canonical runtime memory surface.",
    tags: ["memory", "profile", "facts", "write"],
    exampleInput: {
      request: {
        type: "upsertFact",
        instanceId: "instance-1",
        factKey: "preferences/risk-tolerance",
        factValue: "medium",
      },
    },
    includeInCatalog: () => true,
    enabledBySettings: () => true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: pingRuntimeAction,
    description: "Ping the runtime and receive a small structured echo response.",
    purpose: "Verify that the runtime action surface is reachable before deeper work.",
    tags: ["runtime", "health", "read"],
    exampleInput: {
      message: "health-check",
    },
    includeInCatalog: () => true,
    enabledBySettings: () => true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: createBlockchainAlertAction,
    description: "Create blockchain or market alerts using the live alert action surface.",
    purpose: "Persist alert conditions that should be monitored later.",
    tags: ["alerts", "monitoring"],
    exampleInput: {
      chain: "solana",
      assetSymbol: "SOL",
      condition: {
        kind: "price-above",
        value: 200,
      },
      notification: {
        channel: "runtime",
      },
    },
    includeInCatalog: ({ settings }) => settings.trading.enabled,
    enabledBySettings: ({ settings }) => settings.trading.enabled,
    chatExposed: true,
  },
  {
    kind: "action",
    action: transferAction,
    description: "Transfer SOL or SPL tokens from a managed wallet.",
    purpose: "Execute direct wallet transfers when signing and limits allow it.",
    tags: ["transfers", "wallet", "execution"],
    exampleInput: {
      destination: "8xY...dest",
      amount: "0.25",
      mintAddress: null,
    },
    includeInCatalog: canUseWalletSigningTransfers,
    enabledBySettings: canUseWalletSigningTransfers,
    requiresUserConfirmation: true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: privacyTransferAction,
    description: "Transfer funds through the privacy transfer flow.",
    purpose: "Move funds while using the privacy-preserving runtime route.",
    tags: ["transfers", "privacy", "execution"],
    exampleInput: {
      destination: "8xY...dest",
      amount: "0.25",
      mintAddress: null,
    },
    includeInCatalog: canUseWalletSigningTransfers,
    enabledBySettings: canUseWalletSigningTransfers,
    requiresUserConfirmation: true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: privacyAirdropAction,
    description: "Run the privacy airdrop flow through the managed runtime action surface.",
    purpose: "Seed privacy flow balances when the runtime environment allows it.",
    tags: ["airdrops", "privacy", "execution"],
    exampleInput: {
      amount: "1",
      destination: "8xY...dest",
    },
    includeInCatalog: canUseWalletSigningTransfers,
    enabledBySettings: canUseWalletSigningTransfers,
    requiresUserConfirmation: true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: ultraQuoteSwapAction,
    description: "Request a Jupiter Ultra quote for a proposed swap.",
    purpose: "Price a potential swap before execution.",
    tags: ["swaps", "quote", "jupiter", "read"],
    exampleInput: {
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qvM8h1L4YFj7y2U6TQwYVCc4c",
      amount: "1000000000",
    },
    includeInCatalog: ({ settings }) => settings.trading.enabled && settings.trading.jupiter.ultra.enabled,
    enabledBySettings: ({ settings }) =>
      settings.trading.enabled && settings.trading.jupiter.ultra.enabled && settings.trading.jupiter.ultra.allowQuotes,
    chatExposed: true,
  },
  {
    kind: "action",
    action: ultraExecuteSwapAction,
    description: "Execute a previously prepared Jupiter Ultra swap transaction.",
    purpose: "Finalize a swap after a quote or prepared transaction already exists.",
    tags: ["swaps", "execution", "jupiter"],
    exampleInput: {
      unsignedTransactionBase64: "<prepared-transaction>",
    },
    includeInCatalog: ({ settings }) => settings.trading.enabled && settings.trading.jupiter.ultra.enabled,
    enabledBySettings: ({ settings }) =>
      settings.trading.enabled &&
      settings.trading.jupiter.ultra.enabled &&
      settings.trading.jupiter.ultra.allowExecutions,
    requiresUserConfirmation: true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: ultraSwapAction,
    description: "Run the full Jupiter Ultra quote-and-execute swap flow.",
    purpose: "Perform a swap end-to-end through the runtime action contract.",
    tags: ["swaps", "execution", "jupiter"],
    exampleInput: {
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qvM8h1L4YFj7y2U6TQwYVCc4c",
      amount: "1000000000",
    },
    includeInCatalog: ({ settings }) => settings.trading.enabled && settings.trading.jupiter.ultra.enabled,
    enabledBySettings: canUseUltraSwap,
    requiresUserConfirmation: true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: privacySwapAction,
    description: "Run the privacy swap flow using the managed runtime surface.",
    purpose: "Perform a privacy-routed swap when both signing and Ultra execution are available.",
    tags: ["swaps", "privacy", "execution"],
    exampleInput: {
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qvM8h1L4YFj7y2U6TQwYVCc4c",
      amount: "1000000000",
    },
    includeInCatalog: ({ settings }) => canUseUltraSwap({ settings }) && canUseWalletSigningTransfers({ settings }),
    enabledBySettings: ({ settings }) => canUseUltraSwap({ settings }) && canUseWalletSigningTransfers({ settings }),
    requiresUserConfirmation: true,
    chatExposed: true,
  },
];
