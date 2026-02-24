import { z } from "zod";

const rpcEndpointSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  wsUrl: z.string().min(1),
  enabled: z.boolean(),
});

const networkSchema = z.object({
  chain: z.literal("solana"),
  cluster: z.string().min(1),
  commitment: z.enum(["processed", "confirmed", "finalized"]),
  websocketEnabled: z.boolean(),
  requestTimeoutMs: z.number().int().positive(),
  transactionTimeoutMs: z.number().int().positive(),
  retry: z.object({
    readsMaxAttempts: z.number().int().nonnegative(),
    writesMaxAttempts: z.number().int().nonnegative(),
    backoffMs: z.number().int().nonnegative(),
    backoffMultiplier: z.number().positive(),
  }),
  rpc: z.object({
    strategy: z.enum(["failover"]),
    endpoints: z.array(rpcEndpointSchema).min(1),
  }),
});

const walletSchema = z.object({
  custodyMode: z.enum(["local-encrypted"]),
  defaults: z.object({
    keyEncoding: z.enum(["base64", "hex", "bytes"]),
    createWalletCountLimit: z.number().int().positive(),
    exportFormat: z.enum(["base58"]),
  }),
  dangerously: z.object({
    allowPrivateKeyAccess: z.boolean(),
    allowWalletSigning: z.boolean(),
    allowCreatingWallets: z.boolean(),
    allowDeletingWallets: z.boolean(),
    allowExportingWallets: z.boolean(),
    allowImportingWallets: z.boolean(),
    allowListingWallets: z.boolean(),
    allowShowingWallets: z.boolean(),
    allowUpdatingWallets: z.boolean(),
  }),
});

const tradingSchema = z.object({
  enabled: z.boolean(),
  programId: z.union([z.string().min(1), z.null()]),
  mode: z.object({
    simulation: z.boolean(),
    paperTrading: z.boolean(),
  }),
  limits: z.object({
    maxSwapNotionalSol: z.number().nonnegative(),
    maxSingleTransferSol: z.number().nonnegative(),
    maxPriorityFeeLamports: z.number().int().nonnegative(),
    maxSlippageBps: z.number().int().nonnegative(),
  }),
  jupiter: z.object({
    ultra: z.object({
      enabled: z.boolean(),
      allowQuotes: z.boolean(),
      allowExecutions: z.boolean(),
      allowCancellations: z.boolean(),
    }),
    standard: z.object({
      enabled: z.boolean(),
      allowQuotes: z.boolean(),
      allowExecutions: z.boolean(),
    }),
  }),
  dexscreener: z.object({
    enabled: z.boolean(),
  }),
});

const actionsSchema = z.object({
  dataBased: z.object({
    getMarketData: z.boolean(),
    getAccountInfo: z.boolean(),
    getMultipleAccounts: z.boolean(),
    getBalance: z.boolean(),
    getTokenMetadata: z.boolean(),
    getTokenPrice: z.boolean(),
    dexscreener: z.boolean(),
  }),
  walletBased: z.object({
    checkBalance: z.boolean(),
    checkSolBalance: z.boolean(),
    getWalletState: z.boolean(),
    quoteSwap: z.boolean(),
    executeSwap: z.boolean(),
    ultraQuoteSwap: z.boolean(),
    ultraExecuteSwap: z.boolean(),
    ultraSwap: z.boolean(),
    transferSol: z.boolean(),
    transferToken: z.boolean(),
    createToken: z.boolean(),
    createWallets: z.boolean(),
  }),
  dangerously: z.object({
    allowSwapping: z.boolean(),
    allowMinting: z.boolean(),
    allowBurning: z.boolean(),
  }),
});

const routinesSchema = z.object({
  enabled: z.boolean(),
  dca: z.object({ enabled: z.boolean() }),
  swing: z.object({ enabled: z.boolean() }),
  percentage: z.object({ enabled: z.boolean() }),
  sniper: z.object({ enabled: z.boolean() }),
});

const triggersSchema = z.object({
  enabled: z.boolean(),
  timer: z.object({ enabled: z.boolean() }),
  price: z.object({ enabled: z.boolean() }),
  onChain: z.object({ enabled: z.boolean() }),
});

const agentSchema = z.object({
  enabled: z.boolean(),
  dangerously: z.object({
    allowFilesystemWrites: z.boolean(),
    allowNetworkAccess: z.boolean(),
    allowSystemAccess: z.boolean(),
    allowHardwareAccess: z.boolean(),
  }),
  internetAccess: z.object({
    trustedSitesOnly: z.boolean(),
    allowFullAccess: z.boolean(),
    trustedSites: z.array(z.string()),
    blockedSites: z.array(z.string()),
    allowedProtocols: z.array(z.string()),
    blockedProtocols: z.array(z.string()),
    allowedPorts: z.array(z.number().int().nonnegative()),
    blockedPorts: z.array(z.number().int().nonnegative()),
  }),
});

const runtimeSchema = z.object({
  scheduler: z.object({
    tickMs: z.number().int().positive(),
    maxConcurrentJobs: z.number().int().positive(),
  }),
  dispatcher: z.object({
    maxActionAttempts: z.number().int().positive(),
    defaultActionTimeoutMs: z.number().int().positive(),
    defaultBackoffMs: z.number().int().nonnegative(),
  }),
  idempotency: z.object({
    enabled: z.boolean(),
    ttlHours: z.number().int().positive(),
  }),
});

const storageSchema = z.object({
  sqlite: z.object({
    enabled: z.boolean(),
    path: z.string().min(1),
    walMode: z.boolean(),
    busyTimeoutMs: z.number().int().nonnegative(),
  }),
  files: z.object({
    enabled: z.boolean(),
    eventsDirectory: z.string().min(1),
  }),
  retention: z.object({
    receiptsDays: z.number().int().positive(),
    policyHitsDays: z.number().int().positive(),
    decisionLogsDays: z.number().int().positive(),
  }),
});

const uiSchema = z.object({
  cli: z.object({ enabled: z.boolean() }),
  webGui: z.object({
    enabled: z.boolean(),
    host: z.string().min(1),
    port: z.number().int().positive(),
  }),
  tui: z.object({
    enabled: z.boolean(),
    overviewView: z.boolean(),
    botsView: z.boolean(),
    actionFeedView: z.boolean(),
    controlsView: z.boolean(),
  }),
});

const observabilitySchema = z.object({
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]),
    pretty: z.boolean(),
    includeDecisionTrace: z.boolean(),
  }),
  metrics: z.object({
    enabled: z.boolean(),
  }),
  tracing: z.object({
    enabled: z.boolean(),
  }),
});

export const runtimeSettingsSchema = z.object({
  configVersion: z.literal(1),
  profile: z.enum(["default", "safe"]),
  network: networkSchema,
  wallet: walletSchema,
  trading: tradingSchema,
  actions: actionsSchema,
  routines: routinesSchema,
  triggers: triggersSchema,
  agent: agentSchema,
  runtime: runtimeSchema,
  storage: storageSchema,
  ui: uiSchema,
  observability: observabilitySchema,
});

export type RuntimeSettings = z.output<typeof runtimeSettingsSchema>;
export type RuntimeSettingsInput = z.input<typeof runtimeSettingsSchema>;
