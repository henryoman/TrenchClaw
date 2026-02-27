import path from "node:path";
import { fileURLToPath } from "node:url";

import { enforceUserProtectedSettings, sanitizeAgentSettings } from "./authority";
import { runtimeSettingsSchema, type RuntimeSettings } from "./schema";

export type RuntimeSettingsProfile = "safe" | "dangerous" | "veryDangerous";

const SETTINGS_FILE_BY_PROFILE: Record<RuntimeSettingsProfile, string> = {
  safe: "../../ai/brain/protected/system/safety-modes/safe.yaml",
  dangerous: "../../ai/brain/protected/system/safety-modes/dangerous.yaml",
  veryDangerous: "../../ai/brain/protected/system/safety-modes/veryDangerous.yaml",
};

const ENV_TOKEN_REGEX = /\$\{([A-Z0-9_]+)\}/g;
const SETTINGS_PROFILE_ENV_KEY = "TRENCHCLAW_PROFILE";
const SETTINGS_BASE_FILE_ENV_KEY = "TRENCHCLAW_SETTINGS_BASE_FILE";
const SETTINGS_USER_FILE_ENV_KEY = "TRENCHCLAW_SETTINGS_USER_FILE";
const SETTINGS_AGENT_FILE_ENV_KEY = "TRENCHCLAW_SETTINGS_AGENT_FILE";
const APP_ROOT_DIRECTORY = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const resolveFromAppRoot = (targetPath: string): string => path.resolve(APP_ROOT_DIRECTORY, targetPath);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const toStringValue = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback;

const toNumberValue = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const toBooleanValue = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

const deepMerge = (baseValue: unknown, overlayValue: unknown): unknown => {
  if (!isRecord(baseValue) || !isRecord(overlayValue)) {
    return overlayValue;
  }

  const merged: Record<string, unknown> = { ...baseValue };

  for (const [key, value] of Object.entries(overlayValue)) {
    const currentValue = merged[key];
    merged[key] =
      isRecord(currentValue) && isRecord(value) ? deepMerge(currentValue, value) : value;
  }

  return merged;
};

const resolveEnvTokens = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.replace(ENV_TOKEN_REGEX, (_token, variableName: string) => process.env[variableName] ?? "");
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveEnvTokens(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return Object.fromEntries(entries.map(([key, nestedValue]) => [key, resolveEnvTokens(nestedValue)]));
  }

  return value;
};

const parseYaml = (source: string, filePath: string): unknown => {
  try {
    const parsed = Bun.YAML.parse(source);
    if (parsed == null || typeof parsed !== "object") {
      throw new Error("Settings file must parse to an object");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse settings YAML at "${filePath}": ${message}`, {
      cause: error,
    });
  }
};

const readSettingsFile = async (filePath: string): Promise<unknown> => {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`Settings file does not exist: "${filePath}"`);
  }

  return parseYaml(await file.text(), filePath);
};

const loadOptionalSettingsFile = async (filePath: string | undefined): Promise<unknown> => {
  if (!filePath) {
    return {};
  }

  return readSettingsFile(filePath);
};

const normalizeRuntimeSettings = (
  candidate: unknown,
  profile: RuntimeSettingsProfile,
): Record<string, unknown> => {
  if (!isRecord(candidate)) {
    return {};
  }

  const network = isRecord(candidate.network) ? candidate.network : {};
  const trading = isRecord(candidate.trading) ? candidate.trading : {};
  const wallet = isRecord(candidate.wallet) ? candidate.wallet : {};
  const agent = isRecord(candidate.agent) ? candidate.agent : {};
  const rpc = isRecord(candidate.rpc) ? candidate.rpc : {};
  const rpcProviders = isRecord(rpc.providers) ? rpc.providers : {};
  const primaryRpcName = toStringValue(rpc.primaryRpc, "primary");
  const primaryRpcProvider = isRecord(rpcProviders[primaryRpcName]) ? rpcProviders[primaryRpcName] : null;

  const allowedClusters = toStringArray(network.allowedClusters);
  const resolvedCluster = toStringValue(
    network.cluster,
    allowedClusters[0] ?? (profile === "safe" ? "devnet" : "mainnet-beta"),
  );

  const ultraEnabled =
    toStringValue(trading.preferredSwap, "").toLowerCase() === "ultra" ||
    toStringValue(trading.defaultSwapProfile, "").toLowerCase() === "ultra";
  const maxTradeSizeFromSizing = isRecord(trading.sizing) ? toNumberValue(trading.sizing.maxTradeSize, 0.5) : 0.5;
  const maxTradeSize = Math.max(0, maxTradeSizeFromSizing);

  const walletDangerously = isRecord(wallet.dangerously) ? wallet.dangerously : {};
  const agentDangerously = isRecord(agent.dangerously) ? agent.dangerously : {};
  const internetAccess = isRecord(agent.internetAccess) ? agent.internetAccess : {};

  return {
    configVersion: 1,
    profile: toStringValue(candidate.profile, profile),
    network: {
      chain: "solana",
      cluster: resolvedCluster,
      commitment: toStringValue(network.commitment, "confirmed"),
      websocketEnabled: toBooleanValue(network.websocketEnabled, true),
      requestTimeoutMs: Math.max(1, Math.trunc(toNumberValue(network.requestTimeoutMs, 15_000))),
      transactionTimeoutMs: Math.max(1, Math.trunc(toNumberValue(network.transactionTimeoutMs, 45_000))),
      retry: {
        readsMaxAttempts: Math.max(0, Math.trunc(toNumberValue((network as Record<string, unknown>).readsMaxAttempts, 2))),
        writesMaxAttempts: Math.max(0, Math.trunc(toNumberValue((network as Record<string, unknown>).writesMaxAttempts, 2))),
        backoffMs: Math.max(0, Math.trunc(toNumberValue((network as Record<string, unknown>).backoffMs, 250))),
        backoffMultiplier: Math.max(1, toNumberValue((network as Record<string, unknown>).backoffMultiplier, 2)),
      },
      rpc: {
        strategy: "failover",
        endpoints: [
          {
            name: primaryRpcName,
            url: toStringValue(primaryRpcProvider?.endpointRef, toStringValue((network as Record<string, unknown>).rpcUrl, "http://127.0.0.1:8899")),
            wsUrl: toStringValue(primaryRpcProvider?.wsEndpointRef, toStringValue((network as Record<string, unknown>).wsUrl, "ws://127.0.0.1:8900")),
            enabled: true,
          },
        ],
      },
    },
    wallet: {
      custodyMode: "local-encrypted",
      defaults: {
        keyEncoding: toStringValue(wallet.defaults && isRecord(wallet.defaults) ? wallet.defaults.keyEncoding : undefined, "base64"),
        createWalletCountLimit: Math.max(
          1,
          Math.trunc(
            toNumberValue(wallet.defaults && isRecord(wallet.defaults) ? wallet.defaults.createWalletCountLimit : undefined, 100),
          ),
        ),
        exportFormat: "base58",
      },
      dangerously: {
        allowPrivateKeyAccess: toBooleanValue(walletDangerously.allowPrivateKeyAccess, profile !== "safe"),
        allowWalletSigning: toBooleanValue(walletDangerously.allowWalletSigning, profile !== "safe"),
        allowCreatingWallets: toBooleanValue(walletDangerously.allowCreatingWallets, profile !== "safe"),
        allowDeletingWallets: toBooleanValue(walletDangerously.allowDeletingWallets, profile === "veryDangerous"),
        allowExportingWallets: toBooleanValue(walletDangerously.allowExportingWallets, profile !== "safe"),
        allowImportingWallets: toBooleanValue(walletDangerously.allowImportingWallets, profile !== "safe"),
        allowListingWallets: toBooleanValue(walletDangerously.allowListingWallets, true),
        allowShowingWallets: toBooleanValue(walletDangerously.allowShowingWallets, true),
        allowUpdatingWallets: toBooleanValue(walletDangerously.allowUpdatingWallets, profile !== "safe"),
      },
    },
    trading: {
      enabled: toBooleanValue(trading.enabled, profile !== "safe"),
      programId: null,
      confirmations: {
        requireUserConfirmationForDangerousActions: toBooleanValue(
          trading.requireUserConfirmationForDangerousActions,
          profile !== "veryDangerous",
        ),
        userConfirmationToken: toStringValue((trading as Record<string, unknown>).userConfirmationToken, "confirm"),
      },
      limits: {
        maxSwapNotionalSol: maxTradeSize,
        maxSingleTransferSol: maxTradeSize,
        maxPriorityFeeLamports: Math.max(
          0,
          Math.trunc(toNumberValue((trading as Record<string, unknown>).maxPriorityFeeLamports, 500_000)),
        ),
        maxSlippageBps: Math.max(0, Math.trunc(toNumberValue((trading as Record<string, unknown>).maxSlippageBps, 300))),
      },
      jupiter: {
        ultra: {
          enabled: ultraEnabled,
          allowQuotes: ultraEnabled,
          allowExecutions: ultraEnabled,
          allowCancellations: ultraEnabled,
        },
        standard: {
          enabled: !ultraEnabled,
          allowQuotes: !ultraEnabled,
          allowExecutions: !ultraEnabled && profile !== "safe",
        },
      },
      dexscreener: {
        enabled: true,
      },
    },
    agent: {
      enabled: toBooleanValue(agent.enabled, true),
      dangerously: {
        allowFilesystemWrites: toBooleanValue(agentDangerously.allowFilesystemWrites, profile !== "safe"),
        allowNetworkAccess: toBooleanValue(agentDangerously.allowNetworkAccess, true),
        allowSystemAccess: toBooleanValue(agentDangerously.allowSystemAccess, profile !== "safe"),
        allowHardwareAccess: toBooleanValue(agentDangerously.allowHardwareAccess, profile !== "safe"),
      },
      internetAccess: {
        trustedSitesOnly: toBooleanValue(internetAccess.trustedSitesOnly, true),
        allowFullAccess: toBooleanValue(internetAccess.allowFullAccess, false),
        trustedSites: toStringArray(internetAccess.trustedSites),
        blockedSites: toStringArray(internetAccess.blockedSites),
        allowedProtocols: toStringArray(internetAccess.allowedProtocols),
        blockedProtocols: toStringArray(internetAccess.blockedProtocols),
        allowedPorts: Array.isArray(internetAccess.allowedPorts)
          ? internetAccess.allowedPorts.filter((value): value is number => typeof value === "number")
          : [443, 80],
        blockedPorts: Array.isArray(internetAccess.blockedPorts)
          ? internetAccess.blockedPorts.filter((value): value is number => typeof value === "number")
          : [],
      },
    },
    runtime: {
      scheduler: {
        tickMs: 1_000,
        maxConcurrentJobs: 4,
      },
      dispatcher: {
        maxActionAttempts: 3,
        defaultActionTimeoutMs: 120_000,
        defaultBackoffMs: 300,
      },
      idempotency: {
        enabled: true,
        ttlHours: 24,
      },
    },
    storage: {
      sqlite: {
        enabled: true,
        path: resolveFromAppRoot("src/ai/brain/db/runtime.sqlite"),
        walMode: true,
        busyTimeoutMs: 5_000,
      },
      files: {
        enabled: true,
        eventsDirectory: resolveFromAppRoot("src/ai/brain/db/events"),
      },
      sessions: {
        enabled: true,
        directory: resolveFromAppRoot("src/ai/brain/db/sessions"),
        agentId: "trenchclaw",
        source: "cli",
      },
      memory: {
        enabled: true,
        directory: resolveFromAppRoot("src/ai/brain/db/memory"),
        longTermFile: resolveFromAppRoot("src/ai/brain/db/memory/MEMORY.md"),
      },
      retention: {
        receiptsDays: 14,
      },
    },
    ui: {
      cli: { enabled: true },
      webGui: {
        enabled: true,
        host: toStringValue(process.env.TRENCHCLAW_WEB_GUI_HOST, "127.0.0.1"),
        port: Math.max(1, Math.trunc(toNumberValue(process.env.TRENCHCLAW_WEB_GUI_PORT ? Number(process.env.TRENCHCLAW_WEB_GUI_PORT) : undefined, 4173))),
      },
      tui: {
        enabled: false,
        overviewView: true,
        botsView: true,
        actionFeedView: true,
        controlsView: true,
      },
    },
    observability: {
      logging: {
        level: "info",
        style: "human",
        pretty: true,
        includeDecisionTrace: true,
      },
      metrics: { enabled: false },
      tracing: { enabled: false },
    },
  };
};

export const resolveRuntimeSettingsProfile = (
  profileFromEnv = process.env[SETTINGS_PROFILE_ENV_KEY],
): RuntimeSettingsProfile => {
  if (!profileFromEnv) {
    return "dangerous";
  }

  if (profileFromEnv === "safe" || profileFromEnv === "dangerous" || profileFromEnv === "veryDangerous") {
    return profileFromEnv;
  }

  throw new Error(
    `Invalid ${SETTINGS_PROFILE_ENV_KEY} value "${profileFromEnv}". Expected "safe", "dangerous", or "veryDangerous".`,
  );
};

export const getSettingsFilePath = (profile: RuntimeSettingsProfile): string => {
  const relativePath = SETTINGS_FILE_BY_PROFILE[profile];
  return fileURLToPath(new URL(relativePath, import.meta.url));
};

export const loadRuntimeSettings = async (
  profile: RuntimeSettingsProfile = resolveRuntimeSettingsProfile(),
): Promise<RuntimeSettings> => {
  const baseSettingsPath = process.env[SETTINGS_BASE_FILE_ENV_KEY] || getSettingsFilePath(profile);
  const userSettingsPath = process.env[SETTINGS_USER_FILE_ENV_KEY];
  const agentSettingsPath = process.env[SETTINGS_AGENT_FILE_ENV_KEY];

  const baseSettings = await readSettingsFile(baseSettingsPath);
  const userSettings = await loadOptionalSettingsFile(userSettingsPath);
  const agentSettings = await loadOptionalSettingsFile(agentSettingsPath);
  const sanitizedAgentSettings = sanitizeAgentSettings(agentSettings, profile);
  const mergedSettings = deepMerge(deepMerge(baseSettings, sanitizedAgentSettings), userSettings);
  const protectedMergedSettings = enforceUserProtectedSettings({
    baseSettings,
    userSettings,
    mergedSettings,
  });
  const withResolvedEnv = resolveEnvTokens(protectedMergedSettings);
  const normalizedSettings = normalizeRuntimeSettings(withResolvedEnv, profile);
  const validated = runtimeSettingsSchema.parse(normalizedSettings);
  const usingBundledBaseProfile = !process.env[SETTINGS_BASE_FILE_ENV_KEY];

  if (usingBundledBaseProfile && validated.profile !== profile) {
    throw new Error(
      `Settings profile mismatch after applying overrides. Expected "${profile}" but got "${validated.profile}"`,
    );
  }

  return validated;
};
