import { z } from "zod";
import { DEFAULT_TRADING_PREFERENCES, tradingPreferencesSchema } from "./trading-settings";

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
  confirmations: z.object({
    requireUserConfirmationForDangerousActions: z.boolean(),
    userConfirmationToken: z.string().min(1),
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
  preferences: tradingPreferencesSchema.default(DEFAULT_TRADING_PREFERENCES),
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
  queue: z.object({
    path: z.string().min(1),
  }),
  sessions: z.object({
    enabled: z.boolean(),
    directory: z.string().min(1),
    agentId: z.string().min(1),
    source: z.string().min(1),
    reuseSessionOnBoot: z.boolean(),
  }),
  memory: z.object({
    enabled: z.boolean(),
    directory: z.string().min(1),
    longTermFile: z.string().min(1),
  }),
  retention: z.object({
    receiptsDays: z.number().int().positive(),
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
    style: z.enum(["human", "json"]),
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
  profile: z.enum(["safe", "dangerous", "veryDangerous"]),
  network: networkSchema,
  wallet: walletSchema,
  trading: tradingSchema,
  agent: agentSchema,
  runtime: runtimeSchema,
  storage: storageSchema,
  ui: uiSchema,
  observability: observabilitySchema,
});

export type RuntimeSettings = z.output<typeof runtimeSettingsSchema>;
export type RuntimeSettingsInput = z.input<typeof runtimeSettingsSchema>;
