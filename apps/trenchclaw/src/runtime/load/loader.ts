import { enforceUserProtectedSettings, sanitizeAgentSettings } from "./authority";
import { assertResolvedRuntimeEndpoints } from "./resolved-runtime-endpoints";
import { runtimeSettingsSchema, type RuntimeSettings } from "./schema";
import { resolveRequiredActiveInstanceIdSync } from "../instance-state";
import {
  resolveInstanceMemoryLongTermFilePath,
  resolveInstanceMemoryRoot,
  resolveInstanceQueueSqlitePath,
  resolveInstanceRuntimeDbPath,
  resolveInstanceSessionsRoot,
} from "../instance-paths";
import { resolveCoreRelativePath } from "../runtime-paths";
import { loadResolvedUserSettings } from "../../ai/llm/user-settings-loader";
import { parseStructuredFile } from "../../ai/llm/shared";

export type RuntimeSettingsProfile = "safe" | "dangerous" | "veryDangerous";

const SETTINGS_FILE_BY_PROFILE: Record<RuntimeSettingsProfile, string> = {
  safe: "src/ai/config/safety-modes/safe.json",
  dangerous: "src/ai/config/safety-modes/dangerous.json",
  veryDangerous: "src/ai/config/safety-modes/veryDangerous.json",
};

const SETTINGS_PROFILE_ENV_KEY = "TRENCHCLAW_PROFILE";
const SETTINGS_BASE_FILE_ENV_KEY = "TRENCHCLAW_SETTINGS_BASE_FILE";
const SETTINGS_AGENT_FILE_ENV_KEY = "TRENCHCLAW_SETTINGS_AGENT_FILE";
const LOADER_WARNINGS = new Set<string>();

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

const warnLoaderOnce = (message: string): void => {
  if (LOADER_WARNINGS.has(message)) {
    return;
  }
  LOADER_WARNINGS.add(message);
  console.warn(message);
};

const resolveDefaultStoragePaths = (): {
  sqlitePath: string;
  queuePath: string;
  sessionsDirectory: string;
  memoryDirectory: string;
  memoryLongTermFile: string;
} => {
  const activeInstanceId = resolveRequiredActiveInstanceIdSync(
    "No active instance selected. Storage paths are instance-scoped. Sign in before booting the runtime.",
  );

  return {
    sqlitePath: resolveInstanceRuntimeDbPath(activeInstanceId),
    queuePath: resolveInstanceQueueSqlitePath(activeInstanceId),
    sessionsDirectory: resolveInstanceSessionsRoot(activeInstanceId),
    memoryDirectory: resolveInstanceMemoryRoot(activeInstanceId),
    memoryLongTermFile: resolveInstanceMemoryLongTermFilePath(activeInstanceId),
  };
};

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

const parseSettingsFile = (raw: unknown, filePath: string): unknown => {
  try {
    if (raw == null || typeof raw !== "object") {
      throw new Error("Settings file must parse to an object");
    }
    return raw;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse settings file at "${filePath}": ${message}`, {
      cause: error,
    });
  }
};

const readSettingsFile = async (filePath: string): Promise<unknown> => {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`Settings file does not exist: "${filePath}"`);
  }

  return parseSettingsFile(await parseStructuredFile(filePath), filePath);
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
  const tradingJupiter = isRecord(trading.jupiter) ? trading.jupiter : {};
  const dexscreenerSettings = isRecord(trading.dexscreener) ? trading.dexscreener : {};
  const tradingPreferences = isRecord(trading.preferences) ? trading.preferences : undefined;
  const wallet = isRecord(candidate.wallet) ? candidate.wallet : {};
  const agent = isRecord(candidate.agent) ? candidate.agent : {};
  const storage = isRecord(candidate.storage) ? candidate.storage : {};
  const sessionsStorage = isRecord(storage.sessions) ? storage.sessions : {};
  const rpc = isRecord(candidate.rpc) ? candidate.rpc : {};
  const rpcProviders = isRecord(rpc.providers) ? rpc.providers : {};
  const tradingConfirmations = isRecord(trading.confirmations) ? trading.confirmations : {};
  const tradingLimits = isRecord(trading.limits) ? trading.limits : {};
  const defaultStoragePaths = resolveDefaultStoragePaths();
  const primaryRpcName = toStringValue(rpc.primaryRpc, "primary");
  const primaryRpcProvider = isRecord(rpcProviders[primaryRpcName]) ? rpcProviders[primaryRpcName] : null;

  const allowedClusters = toStringArray(network.allowedClusters);
  const resolvedCluster = toStringValue(
    network.cluster,
    allowedClusters[0] ?? (profile === "safe" ? "devnet" : "mainnet-beta"),
  );

  const preferredSwapProvider = toStringValue(
    tradingPreferences && typeof tradingPreferences.defaultSwapProvider === "string"
      ? tradingPreferences.defaultSwapProvider
      : undefined,
    "",
  ).toLowerCase();
  const requestedSwapProvider =
    preferredSwapProvider ||
    toStringValue(trading.preferredSwap, "").toLowerCase() ||
    toStringValue(trading.defaultSwapProfile, "").toLowerCase() ||
    "ultra";
  const ultraEnabled = requestedSwapProvider !== "standard";
  const triggerSettings = isRecord(tradingJupiter.trigger) ? tradingJupiter.trigger : null;
  if (triggerSettings) {
    warnLoaderOnce(
      'Ignoring deprecated runtime settings under "trading.jupiter.trigger"; Jupiter Trigger order flows are no longer shipped.',
    );
  }
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
          tradingConfirmations.requireUserConfirmationForDangerousActions ?? trading.requireUserConfirmationForDangerousActions,
          profile !== "veryDangerous",
        ),
        userConfirmationToken: toStringValue(tradingConfirmations.userConfirmationToken ?? trading.userConfirmationToken, "confirm"),
      },
      limits: {
        maxSwapNotionalSol: maxTradeSize,
        maxSingleTransferSol: maxTradeSize,
        maxPriorityFeeLamports: Math.max(
          0,
          Math.trunc(toNumberValue(tradingLimits.maxPriorityFeeLamports ?? trading.maxPriorityFeeLamports, 500_000)),
        ),
        maxSlippageBps: Math.max(0, Math.trunc(toNumberValue(tradingLimits.maxSlippageBps ?? trading.maxSlippageBps, 300))),
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
        enabled: toBooleanValue(dexscreenerSettings.enabled, true),
      },
      preferences: tradingPreferences ?? {},
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
        path: defaultStoragePaths.sqlitePath,
        walMode: true,
        busyTimeoutMs: 5_000,
      },
      queue: {
        path: defaultStoragePaths.queuePath,
      },
      sessions: {
        enabled: true,
        directory: defaultStoragePaths.sessionsDirectory,
        agentId: "trenchclaw",
        source: "cli",
        reuseSessionOnBoot: toBooleanValue(sessionsStorage.reuseSessionOnBoot, false),
      },
      memory: {
        enabled: true,
        directory: defaultStoragePaths.memoryDirectory,
        longTermFile: defaultStoragePaths.memoryLongTermFile,
      },
      retention: {
        receiptsDays: 14,
      },
    },
    ui: {
      cli: { enabled: true },
      webGui: {
        enabled: true,
        host: toStringValue(
          candidate.ui && isRecord(candidate.ui) && isRecord(candidate.ui.webGui) ? candidate.ui.webGui.host : undefined,
          "127.0.0.1",
        ),
        port: Math.max(
          1,
          Math.trunc(
            toNumberValue(
              candidate.ui && isRecord(candidate.ui) && isRecord(candidate.ui.webGui)
                ? candidate.ui.webGui.port
                : undefined,
              4173,
            ),
          ),
        ),
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
  return resolveCoreRelativePath(SETTINGS_FILE_BY_PROFILE[profile]);
};

export const loadRuntimeSettings = async (
  profile: RuntimeSettingsProfile = resolveRuntimeSettingsProfile(),
): Promise<RuntimeSettings> => {
  const baseSettingsPath = process.env[SETTINGS_BASE_FILE_ENV_KEY] || getSettingsFilePath(profile);
  const agentSettingsPath = process.env[SETTINGS_AGENT_FILE_ENV_KEY];

  const baseSettings = await readSettingsFile(baseSettingsPath);
  const resolvedDefaultUserSettingsPayload = await loadResolvedUserSettings();
  const userSettings = resolvedDefaultUserSettingsPayload.resolvedSettings;
  const agentSettings = await loadOptionalSettingsFile(agentSettingsPath);
  const sanitizedAgentSettings = sanitizeAgentSettings(agentSettings, profile);
  const mergedSettings = deepMerge(deepMerge(baseSettings, sanitizedAgentSettings), userSettings);
  const protectedMergedSettings = enforceUserProtectedSettings({
    baseSettings,
    userSettings,
    mergedSettings,
  });
  const normalizedSettings = normalizeRuntimeSettings(protectedMergedSettings, profile);
  const validated = runtimeSettingsSchema.parse(normalizedSettings);
  const usingBundledBaseProfile = !process.env[SETTINGS_BASE_FILE_ENV_KEY];

  if (usingBundledBaseProfile && validated.profile !== profile) {
    throw new Error(
      `Settings profile mismatch after applying overrides. Expected "${profile}" but got "${validated.profile}"`,
    );
  }

  return assertResolvedRuntimeEndpoints(validated);
};
