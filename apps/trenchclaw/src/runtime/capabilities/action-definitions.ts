import { createBlockchainAlertAction } from "../../solana/actions/data-fetch/alerts/createBlockchainAlert";
import {
  getDexscreenerLatestAdsAction,
  getDexscreenerLatestCommunityTakeoversAction,
  getDexscreenerLatestTokenBoostsAction,
  getDexscreenerLatestTokenProfilesAction,
  getDexscreenerOrdersByTokenAction,
  getDexscreenerPairByChainAndPairIdAction,
  getDexscreenerTokenPairsByChainAction,
  getDexscreenerTokensByChainAction,
  getDexscreenerTopTokenBoostsAction,
  searchDexscreenerPairsAction,
} from "../../solana/actions/data-fetch/api/dexscreener-actions";
import { getSwapHistoryAction } from "../../solana/actions/data-fetch/api/swapHistory";
import { mutateInstanceMemoryAction } from "../../solana/actions/data-fetch/runtime/mutateInstanceMemory";
import { enqueueRuntimeJobAction } from "../../solana/actions/data-fetch/runtime/enqueueRuntimeJob";
import { getManagedWalletContentsAction } from "../../solana/actions/data-fetch/runtime/getManagedWalletContents";
import { getManagedWalletSolBalancesAction } from "../../solana/actions/data-fetch/runtime/getManagedWalletSolBalances";
import { listKnowledgeDocsAction } from "../../solana/actions/data-fetch/runtime/listKnowledgeDocs";
import { manageRuntimeJobAction } from "../../solana/actions/data-fetch/runtime/manageRuntimeJob";
import { pingRuntimeAction } from "../../solana/actions/data-fetch/runtime/pingRuntime";
import { queryInstanceMemoryAction } from "../../solana/actions/data-fetch/runtime/queryInstanceMemory";
import { queryRuntimeStoreAction } from "../../solana/actions/data-fetch/runtime/queryRuntimeStore";
import { readKnowledgeDocAction } from "../../solana/actions/data-fetch/runtime/readKnowledgeDoc";
import { sleepAction } from "../../solana/actions/data-fetch/runtime/sleep";
import {
  createWalletGroupDirectoryAction,
  createWalletsAction,
  devnetAirdropAction,
  getTriggerOrdersAction,
  managedTriggerCancelOrdersAction,
  managedTriggerOrderAction,
  managedUltraSwapAction,
  scheduleManagedUltraSwapAction,
  privacyAirdropAction,
  privacySwapAction,
  closeTokenAccountAction,
  privacyTransferAction,
  renameWalletsAction,
  transferAction,
  ultraExecuteSwapAction,
  ultraQuoteSwapAction,
  ultraSwapAction,
} from "../../solana/actions/wallet-based";
import type { RuntimeActionCapabilityDefinition, RuntimeReleaseReadinessDescriptor } from "./types";

type RuntimeActionCapabilityDefinitionWithoutReadiness = Omit<RuntimeActionCapabilityDefinition, "releaseReadiness">;

const canUseWalletSigningTransfers = ({ settings }: { settings: Parameters<RuntimeActionCapabilityDefinition["enabledBySettings"]>[0]["settings"] }): boolean =>
  settings.trading.enabled &&
  settings.wallet.dangerously.allowWalletSigning &&
  settings.trading.limits.maxSingleTransferSol > 0;

const canUseUltraSwap = ({ settings }: { settings: Parameters<RuntimeActionCapabilityDefinition["enabledBySettings"]>[0]["settings"] }): boolean =>
  settings.trading.enabled &&
  settings.trading.jupiter.ultra.enabled &&
  settings.trading.jupiter.ultra.allowQuotes &&
  settings.trading.jupiter.ultra.allowExecutions;

const canUseTriggerOrders = ({ settings }: { settings: Parameters<RuntimeActionCapabilityDefinition["enabledBySettings"]>[0]["settings"] }): boolean =>
  settings.trading.enabled &&
  settings.trading.jupiter.trigger.enabled &&
  settings.trading.jupiter.trigger.allowOrders;

const SHIPPED_NOW = (note: string): RuntimeReleaseReadinessDescriptor => ({
  status: "shipped-now",
  note,
});

const LIMITED = (note: string): RuntimeReleaseReadinessDescriptor => ({
  status: "limited",
  note,
});

const RUNTIME_ACTION_RELEASE_READINESS_BY_NAME: Record<string, RuntimeReleaseReadinessDescriptor> = {
  createWalletGroupDirectory: SHIPPED_NOW("Managed wallet creation and organization ship in the current release."),
  createWallets: SHIPPED_NOW("Managed wallet creation and organization ship in the current release."),
  renameWallets: SHIPPED_NOW("Managed wallet creation and organization ship in the current release."),
  queryRuntimeStore: SHIPPED_NOW("Core runtime state and memory surfaces ship in the current release."),
  queryInstanceMemory: SHIPPED_NOW("Core runtime state and memory surfaces ship in the current release."),
  listKnowledgeDocs: SHIPPED_NOW("Knowledge routing and doc lookup ship in the current release."),
  readKnowledgeDoc: SHIPPED_NOW("Knowledge routing and doc lookup ship in the current release."),
  mutateInstanceMemory: SHIPPED_NOW("Core runtime state and memory surfaces ship in the current release."),
  pingRuntime: SHIPPED_NOW("Core runtime state and memory surfaces ship in the current release."),
  sleep: SHIPPED_NOW("Core runtime state and memory surfaces ship in the current release."),
  getManagedWalletContents: SHIPPED_NOW("Managed wallet balance and holdings reads ship in the current release."),
  getManagedWalletSolBalances: SHIPPED_NOW("Managed wallet balance and holdings reads ship in the current release."),
  getDexscreenerLatestAds: SHIPPED_NOW("Dexscreener discovery and market-data reads ship in the current release."),
  getDexscreenerLatestCommunityTakeovers: SHIPPED_NOW("Dexscreener discovery and market-data reads ship in the current release."),
  getDexscreenerLatestTokenBoosts: SHIPPED_NOW("Dexscreener discovery and market-data reads ship in the current release."),
  getDexscreenerLatestTokenProfiles: SHIPPED_NOW("Dexscreener discovery and market-data reads ship in the current release."),
  getDexscreenerOrdersByToken: SHIPPED_NOW("Dexscreener discovery and market-data reads ship in the current release."),
  getDexscreenerPairByChainAndPairId: SHIPPED_NOW("Dexscreener discovery and market-data reads ship in the current release."),
  getDexscreenerTokenPairsByChain: SHIPPED_NOW("Dexscreener discovery and market-data reads ship in the current release."),
  getDexscreenerTokensByChain: SHIPPED_NOW("Dexscreener discovery and market-data reads ship in the current release."),
  getDexscreenerTopTokenBoosts: SHIPPED_NOW("Dexscreener discovery and market-data reads ship in the current release."),
  searchDexscreenerPairs: SHIPPED_NOW("Dexscreener discovery and market-data reads ship in the current release."),
  devnetAirdrop: LIMITED("Available for testing flows, but still a narrow supported surface rather than a headline release feature."),
  enqueueRuntimeJob: LIMITED("Basic queueing and scheduled runtime jobs are available now as the supported automation surface."),
  manageRuntimeJob: LIMITED("Basic queueing and scheduled runtime jobs are available now as the supported automation surface."),
  getSwapHistory: LIMITED("Transfers, swap history, and privacy-routed wallet flows exist, but they are still narrow supported surfaces."),
  transfer: LIMITED("Transfers, swap history, and privacy-routed wallet flows exist, but they are still narrow supported surfaces."),
  closeTokenAccount: LIMITED("Transfers, swap history, and privacy-routed wallet flows exist, but they are still narrow supported surfaces."),
  getTriggerOrders: LIMITED("Jupiter Trigger V1 order reads and managed-wallet order flows are available now, but still a narrow supported surface."),
  managedTriggerOrder: LIMITED("Jupiter Trigger V1 order reads and managed-wallet order flows are available now, but still a narrow supported surface."),
  managedTriggerCancelOrders: LIMITED("Jupiter Trigger V1 order reads and managed-wallet order flows are available now, but still a narrow supported surface."),
  privacyTransfer: LIMITED("Transfers, swap history, and privacy-routed wallet flows exist, but they are still narrow supported surfaces."),
  privacyAirdrop: LIMITED("Transfers, swap history, and privacy-routed wallet flows exist, but they are still narrow supported surfaces."),
  privacySwap: LIMITED("Transfers, swap history, and privacy-routed wallet flows exist, but they are still narrow supported surfaces."),
  ultraQuoteSwap: LIMITED("Jupiter Ultra swap flows are available now, but still limited surfaces with a narrower supported scope."),
  ultraExecuteSwap: LIMITED("Jupiter Ultra swap flows are available now, but still limited surfaces with a narrower supported scope."),
  managedUltraSwap: LIMITED("Jupiter Ultra swap flows are available now, but still limited surfaces with a narrower supported scope."),
  scheduleManagedUltraSwap: LIMITED("Jupiter Ultra swap flows are available now, but still limited surfaces with a narrower supported scope."),
  ultraSwap: LIMITED("Jupiter Ultra swap flows are available now, but still limited surfaces with a narrower supported scope."),
  createBlockchainAlert: LIMITED("Alert creation exists, but it is not yet a broad monitoring platform."),
};

const runtimeActionCapabilityDefinitionsBase: readonly RuntimeActionCapabilityDefinitionWithoutReadiness[] = [
  {
    kind: "action",
    action: devnetAirdropAction,
    description: "Request confirmed SOL airdrops on Solana devnet for raw addresses or managed wallets.",
    purpose: "Fund test wallets so JSON routines can create wallets, airdrop devnet SOL, and run transfers or swaps.",
    tags: ["wallets", "devnet", "airdrops", "testing"],
    exampleInput: {
      walletGroup: "core-wallets",
      walletNames: ["example-wallet-1", "example-wallet-2"],
      amountSol: 2,
    },
    includeInCatalog: () => true,
    enabledBySettings: () => true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: createWalletGroupDirectoryAction,
    description: "Create one flat wallet group directory under the protected keypairs root.",
    purpose: "Prepare a single-level wallet container before creating wallets.",
    tags: ["wallets", "filesystem", "setup"],
    exampleInput: {
      walletGroup: "ops-market-makers",
    },
    includeInCatalog: () => true,
    enabledBySettings: ({ settings }) => settings.wallet.dangerously.allowCreatingWallets,
    chatExposed: true,
  },
  {
    kind: "action",
    action: createWalletsAction,
    description: "Create wallets in one or more flat wallet groups using a single JSON batch payload.",
    purpose: "Provision fresh wallets quickly with simple sequential wallet files when names are omitted.",
    tags: ["wallets", "setup", "keys"],
    exampleInput: {
      groups: [
        {
          walletGroup: "ops-market-makers",
          count: 2,
        },
        {
          walletGroup: "snipers",
          walletNames: ["one", "two"],
        },
      ],
    },
    includeInCatalog: () => true,
    enabledBySettings: ({ settings }) => settings.wallet.dangerously.allowCreatingWallets,
    chatExposed: true,
  },
  {
    kind: "action",
    action: renameWalletsAction,
    description: "Update wallet organization labels for existing wallets without renaming wallet files.",
    purpose: "Organize existing managed wallets without deleting them or touching secret key material.",
    tags: ["wallets", "maintenance"],
    exampleInput: {
      edits: [
        {
          current: {
            walletGroup: "ops-market-makers",
            walletName: "one",
          },
          next: {
            walletGroup: "ops-archive",
            walletName: "main",
          },
        },
      ],
    },
    includeInCatalog: () => true,
    enabledBySettings: ({ settings }) => settings.wallet.dangerously.allowUpdatingWallets,
    chatExposed: true,
  },
  {
    kind: "action",
    action: enqueueRuntimeJobAction,
    description: "Queue a runtime routine for immediate execution or a future Unix-millisecond time.",
    purpose: "Let the model submit durable immediate and scheduled jobs into the runtime queue.",
    tags: ["runtime", "queue", "scheduling", "write"],
    exampleInput: {
      botId: "ops-scheduler",
      routineName: "actionSequence",
      executeAtUnixMs: 1_767_000_000_000,
      config: {
        steps: [
          {
            key: "ping",
            actionName: "pingRuntime",
            input: {
              message: "scheduled run",
            },
          },
        ],
      },
    },
    includeInCatalog: () => true,
    enabledBySettings: () => true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: manageRuntimeJobAction,
    description: "Pause or cancel a queued runtime job by job id.",
    purpose: "Let the model safely stop scheduled or waiting jobs before they execute.",
    tags: ["runtime", "queue", "scheduling", "write"],
    exampleInput: {
      jobSerial: 42,
      operation: "resume",
    },
    includeInCatalog: () => true,
    enabledBySettings: () => true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: listKnowledgeDocsAction,
    description: "List the available TrenchClaw knowledge docs, deep references, and skill packs with short aliases.",
    purpose: "Give the model a simple menu of app knowledge so it can choose the right doc without guessing long file paths.",
    routingHint: "you want to browse available knowledge, discover doc aliases, or search for the right reference before reading it",
    tags: ["knowledge", "docs", "read", "discovery"],
    exampleInput: {
      request: {
        query: "helius cli",
        tier: "all",
      },
    },
    includeInCatalog: () => true,
    enabledBySettings: () => true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: readKnowledgeDocAction,
    description: "Read a knowledge doc or skill file by alias instead of by long repo path.",
    purpose: "Open the exact knowledge file the model needs using a short alias such as `runtime-reference` or `helius-cli-readme`.",
    routingHint: "you already know which knowledge doc you need, or `listKnowledgeDocs` returned the alias to open next",
    tags: ["knowledge", "docs", "read"],
    exampleInput: {
      doc: "helius-cli-readme",
      offset: 1,
      limit: 120,
    },
    includeInCatalog: () => true,
    enabledBySettings: () => true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: queryRuntimeStoreAction,
    description: "Read conversations, jobs, receipts, runtime search results, and other durable runtime state.",
    purpose: "Inspect runtime history and state without mutating it, including queued wallet-scan job status and results.",
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
    action: getSwapHistoryAction,
    description: "Fetch the 20 most recent Solana swaps for a wallet using Helius enhanced transaction history.",
    purpose: "Show recent swap activity with backend UTC timestamps plus Pacific display timestamps for chat responses and UI rendering.",
    tags: ["swaps", "history", "helius", "read"],
    exampleInput: {
      walletAddress: "9xQeWvG816bUx9EPfK5Yw9s6o1tuVd7a3mZ9zNnV3xF",
      limit: 20,
    },
    includeInCatalog: ({ settings }) => settings.trading.enabled,
    enabledBySettings: ({ settings }) => settings.trading.enabled,
    chatExposed: true,
  },
  {
    kind: "action",
    action: getDexscreenerLatestTokenProfilesAction,
    description: "Fetch a fresh discovery feed of the latest token profiles from Dexscreener.",
    purpose: "Get a lightweight fresh-token discovery feed when the user asks what is new, newly listed, or when you need candidate tokens before pulling concrete market metrics.",
    routingHint: "the user asks what is new, newly listed, or you need a first discovery pass before ranking candidate tokens",
    tags: ["dexscreener", "market-data", "profiles"],
    exampleInput: {},
    includeInCatalog: ({ settings }) => settings.trading.enabled,
    enabledBySettings: ({ settings }) => settings.trading.enabled && settings.trading.dexscreener.enabled,
    chatExposed: true,
  },
  {
    kind: "action",
    action: getDexscreenerLatestTokenBoostsAction,
    description: "Fetch the most recently boosted tokens from Dexscreener.",
    purpose: "Inspect the newest boosted or newly promoted tokens when the user explicitly asks what was just pushed, not as the default tool for broad 'hot today' or trending questions.",
    routingHint: "the user explicitly asks what was just boosted, newly promoted, or most recently pushed on Dexscreener",
    tags: ["dexscreener", "market-data", "boosts"],
    exampleInput: {},
    includeInCatalog: ({ settings }) => settings.trading.enabled,
    enabledBySettings: ({ settings }) => settings.trading.enabled && settings.trading.dexscreener.enabled,
    chatExposed: true,
  },
  {
    kind: "action",
    action: getDexscreenerTopTokenBoostsAction,
    description: "Fetch the top boosted tokens from Dexscreener right now.",
    purpose: "Rank current Dexscreener boost activity when the user asks what is hot, trending, or most promoted right now, not as a direct proxy for top volume or highest trading activity.",
    routingHint: "the user asks what is hot, trending, or most promoted right now and a boost-ranked starting set is the best first pass",
    tags: ["dexscreener", "market-data", "boosts"],
    exampleInput: {},
    includeInCatalog: ({ settings }) => settings.trading.enabled,
    enabledBySettings: ({ settings }) => settings.trading.enabled && settings.trading.dexscreener.enabled,
    chatExposed: true,
  },
  {
    kind: "action",
    action: getDexscreenerOrdersByTokenAction,
    description: "Fetch Dexscreener paid order status for a token.",
    purpose: "Check listing and paid promotion order state for a token address.",
    tags: ["dexscreener", "orders", "token"],
    exampleInput: {
      tokenAddress: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    },
    includeInCatalog: ({ settings }) => settings.trading.enabled,
    enabledBySettings: ({ settings }) => settings.trading.enabled && settings.trading.dexscreener.enabled,
    chatExposed: true,
  },
  {
    kind: "action",
    action: searchDexscreenerPairsAction,
    description: "Search Dexscreener pairs by query text.",
    purpose: "Find token or pair candidates by symbol, name, or address before pulling detailed market data when the user names a token or gives only a fuzzy symbol hint.",
    routingHint: "the user gives only a symbol, ticker, token name, or fuzzy token reference and you need discovery before any deeper market read",
    tags: ["dexscreener", "search", "pairs"],
    exampleInput: {
      query: "SOL/USDC",
    },
    includeInCatalog: ({ settings }) => settings.trading.enabled,
    enabledBySettings: ({ settings }) => settings.trading.enabled && settings.trading.dexscreener.enabled,
    chatExposed: true,
  },
  {
    kind: "action",
    action: getDexscreenerPairByChainAndPairIdAction,
    description: "Fetch a Dexscreener pair by Solana pair address.",
    purpose: "Get detailed market data for one specific pair after discovery so you can answer from concrete liquidity, volume, and price-change fields.",
    routingHint: "the user already gave one exact Solana pair address and wants that market's concrete data",
    tags: ["dexscreener", "pair", "market-data"],
    exampleInput: {
      pairAddress: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    },
    includeInCatalog: ({ settings }) => settings.trading.enabled,
    enabledBySettings: ({ settings }) => settings.trading.enabled && settings.trading.dexscreener.enabled,
    chatExposed: true,
  },
  {
    kind: "action",
    action: getDexscreenerTokenPairsByChainAction,
    description: "Fetch Dexscreener pools for a token address on Solana.",
    purpose: "Inspect all pools associated with one token address after discovery when you need to identify the right market or best pool for that token.",
    routingHint: "the user gave one exact token address and you need that token's pools before answering",
    tags: ["dexscreener", "token", "pairs"],
    exampleInput: {
      tokenAddress: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    },
    includeInCatalog: ({ settings }) => settings.trading.enabled,
    enabledBySettings: ({ settings }) => settings.trading.enabled && settings.trading.dexscreener.enabled,
    chatExposed: true,
  },
  {
    kind: "action",
    action: getDexscreenerTokensByChainAction,
    description: "Fetch Dexscreener market data for up to 30 token addresses on Solana.",
    purpose: "Batch-load price, liquidity, volume, and price-change data for a small discovered Solana token set so you can rank, compare, and answer directly without extra exploration.",
    routingHint: "you already know a small set of token addresses and need a concrete batch comparison or ranking answer",
    tags: ["dexscreener", "tokens", "market-data"],
    exampleInput: {
      tokenAddresses: [
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      ],
    },
    includeInCatalog: ({ settings }) => settings.trading.enabled,
    enabledBySettings: ({ settings }) => settings.trading.enabled && settings.trading.dexscreener.enabled,
    chatExposed: true,
  },
  {
    kind: "action",
    action: getDexscreenerLatestCommunityTakeoversAction,
    description: "Fetch the latest community takeovers from Dexscreener.",
    purpose: "Inspect current community takeover listings.",
    tags: ["dexscreener", "community", "market-data"],
    exampleInput: {},
    includeInCatalog: ({ settings }) => settings.trading.enabled,
    enabledBySettings: ({ settings }) => settings.trading.enabled && settings.trading.dexscreener.enabled,
    chatExposed: true,
  },
  {
    kind: "action",
    action: getDexscreenerLatestAdsAction,
    description: "Fetch the latest ads from Dexscreener.",
    purpose: "Inspect recent Dexscreener ad inventory and promoted listings.",
    tags: ["dexscreener", "ads", "market-data"],
    exampleInput: {},
    includeInCatalog: ({ settings }) => settings.trading.enabled,
    enabledBySettings: ({ settings }) => settings.trading.enabled && settings.trading.dexscreener.enabled,
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
        instanceId: "01",
      },
    },
    includeInCatalog: () => true,
    enabledBySettings: () => true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: getManagedWalletContentsAction,
    description: "Fetch full managed-wallet contents: SOL, fungible balances, and collectible counts for each wallet.",
    purpose: "Answer managed-wallet holdings questions directly, preferring Helius DAS metadata when Helius is the active private RPC and queueing heavier scans when inline reads would be less reliable.",
    tags: ["wallets", "balances", "tokens", "read"],
    exampleInput: {
      walletGroup: "practice-wallets",
    },
    includeInCatalog: () => true,
    enabledBySettings: () => true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: getManagedWalletSolBalancesAction,
    description: "Fetch SOL balances for managed wallets in the active or requested instance.",
    purpose: "Answer wallet balance questions directly using managed wallet metadata, including label-file fallback when the wallet library file is missing.",
    tags: ["wallets", "balances", "sol", "read"],
    exampleInput: {
      walletGroup: "practice-wallets",
    },
    includeInCatalog: () => true,
    enabledBySettings: () => true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: mutateInstanceMemoryAction,
    description: "Write instance-scoped profile fields and durable facts.",
    purpose: "Store user preferences and other persistent memory in the canonical runtime memory surface.",
    tags: ["memory", "profile", "facts", "write"],
    exampleInput: {
      request: {
        type: "upsertFact",
        instanceId: "01",
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
    action: sleepAction,
    description: "Pause a sequential routine for a fixed number of milliseconds.",
    purpose: "Insert deterministic waits between action-sequence steps.",
    tags: ["runtime", "timing", "sequence"],
    exampleInput: {
      waitMs: 2500,
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
      userConfirmationToken: "confirm",
    },
    includeInCatalog: canUseWalletSigningTransfers,
    enabledBySettings: canUseWalletSigningTransfers,
    requiresUserConfirmation: true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: closeTokenAccountAction,
    description: "Close an empty SPL token account and reclaim its rent.",
    purpose: "Clean up an empty managed-wallet token account after balances have been moved out so the locked rent can be recovered.",
    tags: ["transfers", "wallet", "cleanup"],
    exampleInput: {
      walletGroup: "core-wallets",
      walletName: "001",
      mintAddress: "CxWPdDBqxVo3fnTMRTvNuSrd4gkp78udSrFvkVDBAGS",
      userConfirmationToken: "confirm",
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
    action: getTriggerOrdersAction,
    description: "List active or historical Jupiter Trigger V1 orders for a managed wallet or raw address.",
    purpose: "Inspect current and historical trigger orders before creating replacements or cancelling existing orders.",
    tags: ["trigger", "orders", "jupiter", "read"],
    exampleInput: {
      walletGroup: "core-wallets",
      walletName: "maker-1",
      orderStatus: "active",
    },
    includeInCatalog: ({ settings }) => settings.trading.enabled && settings.trading.jupiter.trigger.enabled,
    enabledBySettings: ({ settings }) =>
      settings.trading.enabled &&
      settings.trading.jupiter.trigger.enabled &&
      settings.trading.jupiter.trigger.allowReads,
    chatExposed: true,
  },
  {
    kind: "action",
    action: managedTriggerOrderAction,
    description: "Create and submit a Jupiter Trigger V1 order from a managed wallet.",
    purpose: "Place a single managed-wallet trigger order, especially direct exact-price targets, and return the order id needed to track or cancel the active order later.",
    tags: ["trigger", "orders", "jupiter", "wallets", "execution"],
    exampleInput: {
      walletGroup: "core-wallets",
      walletName: "maker-1",
      inputCoin: "JUP",
      outputCoin: "SOL",
      amount: "100",
      direction: "sellAbove",
      trigger: {
        kind: "exactPrice",
        price: "0.005",
      },
    },
    includeInCatalog: ({ settings }) => settings.trading.enabled && settings.trading.jupiter.trigger.enabled,
    enabledBySettings: canUseTriggerOrders,
    requiresUserConfirmation: true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: managedTriggerCancelOrdersAction,
    description: "Cancel one or more Jupiter Trigger V1 orders for a managed wallet.",
    purpose: "Withdraw managed trigger orders cleanly when the user wants to stop or replace existing trigger exposure.",
    tags: ["trigger", "orders", "jupiter", "wallets", "cancel"],
    exampleInput: {
      walletGroup: "core-wallets",
      walletName: "maker-1",
      orders: ["7nE9GJoYHNmtaQvTQpota3KV2oz4pQ2dA6nvYK8EUJHV"],
    },
    includeInCatalog: ({ settings }) => settings.trading.enabled && settings.trading.jupiter.trigger.enabled,
    enabledBySettings: ({ settings }) =>
      settings.trading.enabled &&
      settings.trading.jupiter.trigger.enabled &&
      settings.trading.jupiter.trigger.allowCancellations,
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
    action: managedUltraSwapAction,
    description: "Run a simple Jupiter Ultra swap using a managed filesystem wallet.",
    purpose: "Execute direct managed-wallet swaps while letting Ultra handle routing, slippage, and fees.",
    tags: ["swaps", "execution", "jupiter", "wallets"],
    exampleInput: {
      swapType: "ultra",
      walletGroup: "core-wallets",
      walletName: "maker-1",
      inputCoin: "SOL",
      outputCoin: "JUP",
      amount: "0.1",
      amountUnit: "ui",
    },
    includeInCatalog: ({ settings }) => settings.trading.enabled && settings.trading.jupiter.ultra.enabled,
    enabledBySettings: canUseUltraSwap,
    requiresUserConfirmation: true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: scheduleManagedUltraSwapAction,
    description: "Schedule a future managed-wallet Ultra swap or equal-interval DCA routine.",
    purpose: "Queue one future swap or a managed Ultra DCA plan without exposing manual Ultra fee or slippage controls.",
    tags: ["swaps", "scheduling", "dca", "jupiter", "wallets"],
    exampleInput: {
      walletGroup: "core-wallets",
      walletName: "maker-1",
      inputCoin: "SOL",
      outputCoin: "JUP",
      amount: "0.3",
      amountUnit: "ui",
      schedule: {
        kind: "dca",
        installments: 3,
        startAtUnixMs: 1_767_000_000_000,
        intervalMs: 3_600_000,
      },
    },
    includeInCatalog: ({ settings }) => settings.trading.enabled && settings.trading.jupiter.ultra.enabled,
    enabledBySettings: canUseUltraSwap,
    requiresUserConfirmation: true,
    chatExposed: true,
  },
  {
    kind: "action",
    action: ultraSwapAction,
    description: "Run the full Jupiter Ultra quote-and-execute swap flow.",
    purpose: "Perform an end-to-end Ultra swap while relying on Ultra-managed execution settings.",
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

export const runtimeActionCapabilityDefinitions: readonly RuntimeActionCapabilityDefinition[] =
  runtimeActionCapabilityDefinitionsBase.map((definition): RuntimeActionCapabilityDefinition => {
    const releaseReadiness = RUNTIME_ACTION_RELEASE_READINESS_BY_NAME[definition.action.name];
    if (!releaseReadiness) {
      throw new Error(`Missing release readiness classification for runtime action "${definition.action.name}".`);
    }

    return Object.assign({}, definition, { releaseReadiness });
  });
