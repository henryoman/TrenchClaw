import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";

import { getGatewayToolNamesForLane } from "../../apps/trenchclaw/src/ai/gateway/lanePolicy";
import { getRuntimeToolSnapshot, resolveToolVisibility } from "../../apps/trenchclaw/src/tools";
import { loadRuntimeSettings } from "../../apps/trenchclaw/src/runtime/settings";
import { createPersistedTestInstance } from "../helpers/instanceFixtures";
import { runtimeStatePath } from "../helpers/corePaths";

const DEXSCREENER_MODEL_TOOL_NAMES = [
  "getDexscreenerLatestAds",
  "getDexscreenerLatestCommunityTakeovers",
  "getDexscreenerLatestTokenBoosts",
  "getDexscreenerLatestTokenProfiles",
  "getDexscreenerOrdersByToken",
  "getDexscreenerPairByChainAndPairId",
  "getDexscreenerTokenPairsByChain",
  "getDexscreenerTokensByChain",
  "getDexscreenerTopTokenBoosts",
  "searchDexscreenerPairs",
] as const;

const HOLDER_MODEL_TOOL_NAMES = [
  "getTokenHolderDistribution",
  "rankDexscreenerTopTokenBoostsByWhales",
] as const;

const GECKOTERMINAL_MODEL_TOOL_NAMES = [
  "downloadGeckoTerminalOhlcv",
  "getTokenPricePerformance",
] as const;

const TEST_ENV_KEYS = [
  "TRENCHCLAW_SETTINGS_BASE_FILE",
  "TRENCHCLAW_RUNTIME_SETTINGS_FILE",
  "TRENCHCLAW_SETTINGS_AGENT_FILE",
  "TRENCHCLAW_VAULT_FILE",
  "TRENCHCLAW_VAULT_TEMPLATE_FILE",
  "TRENCHCLAW_PROFILE",
  "TRENCHCLAW_ACTIVE_INSTANCE_ID",
] as const;
const initialEnv = Object.fromEntries(TEST_ENV_KEYS.map((key) => [key, process.env[key]]));
const createdFiles: string[] = [];
const createdPaths = new Set<string>();
const TEST_SAFE_SETTINGS_YAML = `
configVersion: 1
profile: safe
network:
  chain: solana
  cluster: devnet
  commitment: confirmed
  websocketEnabled: true
  requestTimeoutMs: 10000
  transactionTimeoutMs: 45000
  retry:
    readsMaxAttempts: 3
    writesMaxAttempts: 3
    backoffMs: 500
    backoffMultiplier: 1.5
  rpc:
    strategy: failover
    endpoints:
      - name: primary
        url: https://rpc.example
        wsUrl: wss://ws.example
        enabled: true
wallet:
  custodyMode: local-encrypted
  defaults:
    keyEncoding: base64
    createWalletCountLimit: 100
    exportFormat: base58
  dangerously:
    allowPrivateKeyAccess: false
    allowWalletSigning: false
    allowCreatingWallets: false
    allowDeletingWallets: false
    allowExportingWallets: false
    allowImportingWallets: false
    allowListingWallets: true
    allowShowingWallets: true
    allowUpdatingWallets: false
trading:
  enabled: false
  mode:
    simulation: true
    paperTrading: true
  confirmations:
    requireUserConfirmationForDangerousActions: true
    userConfirmationToken: confirm
  limits:
    maxSwapNotionalSol: 1
    maxSingleTransferSol: 1
    maxPriorityFeeLamports: 1000000
    maxSlippageBps: 100
  jupiter:
    ultra:
      enabled: false
      allowQuotes: false
      allowExecutions: false
      allowCancellations: false
    standard:
      enabled: false
      allowQuotes: false
      allowExecutions: false
  dexscreener:
    enabled: true
agent:
  enabled: true
  dangerously:
    allowFilesystemWrites: false
    allowNetworkAccess: true
    allowSystemAccess: false
    allowHardwareAccess: false
  internetAccess:
    trustedSitesOnly: true
    allowFullAccess: false
    trustedSites: []
    blockedSites: []
    allowedProtocols: [https]
    blockedProtocols: []
    allowedPorts: [443, 80]
    blockedPorts: []
runtime:
  scheduler:
    tickMs: 1000
    maxConcurrentJobs: 4
  dispatcher:
    maxActionAttempts: 3
    defaultActionTimeoutMs: 20000
    defaultBackoffMs: 500
  idempotency:
    enabled: true
    ttlHours: 24
storage:
  sqlite:
    enabled: false
    path: /tmp/trenchclaw-tool-snapshot-tests.db
    walMode: true
    busyTimeoutMs: 5000
  sessions:
    enabled: false
    directory: /tmp/trenchclaw-sessions
    agentId: test-agent
    source: tests
  memory:
    enabled: false
    directory: /tmp/trenchclaw-memory
    longTermFile: memory.md
  retention:
    receiptsDays: 7
ui:
  cli:
    enabled: true
  webGui:
    enabled: false
    host: 127.0.0.1
    port: 3000
  tui:
    enabled: false
    overviewView: true
    botsView: true
    actionFeedView: true
    controlsView: true
observability:
  logging:
    level: info
    style: human
    pretty: false
    includeDecisionTrace: false
  metrics:
    enabled: false
  tracing:
    enabled: false
`;

const writeTempFile = async (extension: "yaml" | "json", content: string): Promise<string> => {
  const target = `/tmp/trenchclaw-tool-snapshots-${crypto.randomUUID()}.${extension}`;
  await Bun.write(target, content);
  createdFiles.push(target);
  return target;
};

beforeEach(async () => {
  process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile("yaml", TEST_SAFE_SETTINGS_YAML);
  process.env.TRENCHCLAW_RUNTIME_SETTINGS_FILE = await writeTempFile("json", "{}");
  delete process.env.TRENCHCLAW_SETTINGS_AGENT_FILE;
  delete process.env.TRENCHCLAW_VAULT_FILE;
  delete process.env.TRENCHCLAW_VAULT_TEMPLATE_FILE;
  process.env.TRENCHCLAW_PROFILE = "safe";
  process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = "01";
  createdPaths.add(await createPersistedTestInstance("01"));
});

afterEach(async () => {
  for (const key of TEST_ENV_KEYS) {
    const initial = initialEnv[key];
    if (initial === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = initial;
  }

  for (const filePath of createdFiles.splice(0)) {
    await Bun.file(filePath).delete().catch(() => {});
  }

  for (const targetPath of createdPaths) {
    await rm(targetPath, { recursive: true, force: true });
  }
  createdPaths.clear();
  await Bun.file(runtimeStatePath("instances", "active-instance.json")).delete().catch(() => {});
});

describe("runtime tool snapshot", () => {
  test("safe profile exposes read-only workspace tools but not workspace writes", async () => {
    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeToolSnapshot(settings);
    const modelToolNames = snapshot.modelTools.map((toolEntry) => toolEntry.name);

    expect(modelToolNames).toContain("workspaceBash");
    expect(modelToolNames).toContain("workspaceReadFile");
    expect(modelToolNames).toContain("listKnowledgeDocs");
    expect(modelToolNames).toContain("readKnowledgeDoc");
    expect(modelToolNames).not.toContain("workspaceWriteFile");
    expect(modelToolNames).not.toContain("createWallets");
    expect(snapshot.modelTools.find((toolEntry) => toolEntry.name === "workspaceReadFile")?.releaseReadinessStatus).toBe(
      "shipped-now",
    );
    expect(snapshot.comingSoonFeatures.some((feature) => feature.id === "helius-sender")).toBe(true);
  });

  test("exposes Dexscreener model tools when trading is enabled", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile(
      "yaml",
      TEST_SAFE_SETTINGS_YAML.replace("trading:\n  enabled: false", "trading:\n  enabled: true"),
    );

    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeToolSnapshot(settings);
    const modelToolNames = snapshot.modelTools.map((toolEntry) => toolEntry.name);

    expect(modelToolNames).toEqual(expect.arrayContaining([...DEXSCREENER_MODEL_TOOL_NAMES, ...HOLDER_MODEL_TOOL_NAMES]));
  });

  test("describes Dexscreener tools clearly enough for ranking versus recency selection", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile(
      "yaml",
      TEST_SAFE_SETTINGS_YAML.replace("trading:\n  enabled: false", "trading:\n  enabled: true"),
    );

    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeToolSnapshot(settings);
    const latestBoosts = snapshot.modelTools.find((toolEntry) => toolEntry.name === "getDexscreenerLatestTokenBoosts");
    const topBoosts = snapshot.modelTools.find((toolEntry) => toolEntry.name === "getDexscreenerTopTokenBoosts");
    const tokenBatch = snapshot.modelTools.find((toolEntry) => toolEntry.name === "getDexscreenerTokensByChain");
    const holderDistribution = snapshot.modelTools.find((toolEntry) => toolEntry.name === "getTokenHolderDistribution");
    const whaleRanking = snapshot.modelTools.find((toolEntry) => toolEntry.name === "rankDexscreenerTopTokenBoostsByWhales");

    expect(latestBoosts?.toolDescription).toContain("what was just boosted");
    expect(latestBoosts?.toolDescription).toContain("not as the default tool for broad 'hot today' or trending questions");
    expect(topBoosts?.toolDescription).toContain("what is hot, trending, or most promoted right now");
    expect(tokenBatch?.toolDescription).toContain("concrete batch comparison or ranking answer");
    expect(holderDistribution?.toolDescription).toContain("whales, top holders, holder concentration, or largest accounts");
    expect(whaleRanking?.toolDescription).toContain("which hot, trending, or boosted token currently has the most whales");
  });

  test("exposes GeckoTerminal OHLC download with workspace-oriented reasoning when trading is enabled", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile(
      "yaml",
      TEST_SAFE_SETTINGS_YAML.replace("trading:\n  enabled: false", "trading:\n  enabled: true"),
    );

    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeToolSnapshot(settings);
    const modelToolNames = snapshot.modelTools.map((toolEntry) => toolEntry.name);
    const ohlcDownloadTool = snapshot.modelTools.find((toolEntry) => toolEntry.name === "downloadGeckoTerminalOhlcv");

    expect(modelToolNames).toEqual(expect.arrayContaining(GECKOTERMINAL_MODEL_TOOL_NAMES));
    expect(ohlcDownloadTool?.toolDescription).toContain("raw Solana candle data saved to the runtime workspace");
    expect(ohlcDownloadTool?.toolDescription).toContain("later research");
    expect(ohlcDownloadTool?.releaseReadinessStatus).toBe("shipped-now");
  });

  test("exposes managed token price performance with minimal-input guidance when trading is enabled", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile(
      "yaml",
      TEST_SAFE_SETTINGS_YAML.replace("trading:\n  enabled: false", "trading:\n  enabled: true"),
    );

    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeToolSnapshot(settings);
    const toolEntry = snapshot.modelTools.find((toolEntry) => toolEntry.name === "getTokenPricePerformance");

    expect(toolEntry).toBeDefined();
    expect(toolEntry?.releaseReadinessStatus).toBe("shipped-now");
    expect(toolEntry?.toolDescription).toContain("one tiny JSON surface");
    expect(toolEntry?.toolDescription).toContain("current price, historical candle, and signed percentage change");
  });

  test("exposes managed token launch time with minimal-input guidance when trading is enabled", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile(
      "yaml",
      TEST_SAFE_SETTINGS_YAML.replace("trading:\n  enabled: false", "trading:\n  enabled: true"),
    );

    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeToolSnapshot(settings);
    const toolEntry = snapshot.modelTools.find((toolEntry) => toolEntry.name === "getTokenLaunchTime");

    expect(toolEntry).toBeDefined();
    expect(toolEntry?.releaseReadinessStatus).toBe("shipped-now");
    expect(toolEntry?.toolDescription).toContain("one tiny JSON surface");
    expect(toolEntry?.toolDescription).toContain("first known pool or the current main pool");
  });

  test("hides Dexscreener model tools when the integration is disabled", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile(
      "yaml",
      TEST_SAFE_SETTINGS_YAML
        .replace("trading:\n  enabled: false", "trading:\n  enabled: true")
        .replace("  dexscreener:\n    enabled: true", "  dexscreener:\n    enabled: false"),
    );

    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeToolSnapshot(settings);
    const modelToolNames = snapshot.modelTools.map((toolEntry) => toolEntry.name);

    for (const toolName of DEXSCREENER_MODEL_TOOL_NAMES) {
      expect(modelToolNames).not.toContain(toolName);
    }
  });

  test("exposes transfer to the model only when wallet signing transfers are enabled", async () => {
    const defaultSettings = await loadRuntimeSettings("safe");
    const defaultSnapshot = await getRuntimeToolSnapshot(defaultSettings);
    expect(defaultSnapshot.modelTools.map((toolEntry) => toolEntry.name)).not.toContain("transfer");
    expect(defaultSnapshot.modelTools.map((toolEntry) => toolEntry.name)).not.toContain("closeTokenAccount");

    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile(
      "yaml",
      TEST_SAFE_SETTINGS_YAML
        .replace("  enabled: false", "  enabled: true")
        .replace("    allowWalletSigning: false", "    allowWalletSigning: true"),
    );

    const enabledSettings = await loadRuntimeSettings("safe");
    const enabledSnapshot = await getRuntimeToolSnapshot(enabledSettings);
    expect(enabledSnapshot.modelTools.map((toolEntry) => toolEntry.name)).toContain("transfer");
    expect(enabledSnapshot.modelTools.map((toolEntry) => toolEntry.name)).toContain("closeTokenAccount");
    expect(enabledSnapshot.modelTools.find((toolEntry) => toolEntry.name === "transfer")?.releaseReadinessStatus).toBe(
      "limited",
    );
    expect(enabledSnapshot.modelTools.find((toolEntry) => toolEntry.name === "transfer")?.toolDescription).toContain(
      "Release readiness: limited.",
    );
  });

  test("exposes Jupiter Trigger tools when trigger settings are enabled", async () => {
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map((entry) => String(entry)).join(" "));
    };

    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile(
      "yaml",
      TEST_SAFE_SETTINGS_YAML
        .replace("trading:\n  enabled: false", "trading:\n  enabled: true")
        .replace(
          "    standard:\n      enabled: false\n      allowQuotes: false\n      allowExecutions: false",
          "    trigger:\n      enabled: true\n      allowOrders: true\n      allowReads: true\n      allowCancellations: true\n    standard:\n      enabled: false\n      allowQuotes: false\n      allowExecutions: false",
        ),
    );
    process.env.TRENCHCLAW_VAULT_FILE = await writeTempFile(
      "json",
      JSON.stringify({
        integrations: {
          jupiter: {
            "api-key": "vault-trigger-key",
          },
        },
      }),
    );

    try {
      const settings = await loadRuntimeSettings("safe");
      const snapshot = await getRuntimeToolSnapshot(settings);
      const modelToolNames = snapshot.modelTools.map((toolEntry) => toolEntry.name);

      expect(modelToolNames).toContain("getTriggerOrders");
      expect(modelToolNames).toContain("managedTriggerOrder");
      expect(modelToolNames).toContain("managedTriggerCancelOrders");
      expect(warnings).toHaveLength(0);
    } finally {
      console.warn = originalWarn;
    }
  });

  test("hides Jupiter Trigger tools when trigger settings are enabled but no Jupiter key is configured", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile(
      "yaml",
      TEST_SAFE_SETTINGS_YAML
        .replace("trading:\n  enabled: false", "trading:\n  enabled: true")
        .replace(
          "    standard:\n      enabled: false\n      allowQuotes: false\n      allowExecutions: false",
          "    trigger:\n      enabled: true\n      allowOrders: true\n      allowReads: true\n      allowCancellations: true\n    standard:\n      enabled: false\n      allowQuotes: false\n      allowExecutions: false",
        ),
    );

    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeToolSnapshot(settings);
    const modelToolNames = snapshot.modelTools.map((toolEntry) => toolEntry.name);

    expect(modelToolNames).not.toContain("getTriggerOrders");
    expect(modelToolNames).not.toContain("managedTriggerOrder");
    expect(modelToolNames).not.toContain("managedTriggerCancelOrders");
  });

  test("exposes flat JSON managed-swap scheduling while keeping the internal routine schema hidden", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile(
      "yaml",
      TEST_SAFE_SETTINGS_YAML
        .replace("trading:\n  enabled: false", "trading:\n  enabled: true")
        .replace(
          "  jupiter:\n    ultra:\n      enabled: false\n      allowQuotes: false\n      allowExecutions: false",
          "  jupiter:\n    ultra:\n      enabled: true\n      allowQuotes: true\n      allowExecutions: true",
        ),
    );

    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeToolSnapshot(settings);
    const modelToolNames = snapshot.modelTools.map((toolEntry) => toolEntry.name);

    expect(modelToolNames).toContain("scheduleManagedSwap");
    expect(modelToolNames).not.toContain("submitTradingRoutine");
  });

  test("exposes managedSwap to the model when standard swap settings are enabled", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile(
      "yaml",
      TEST_SAFE_SETTINGS_YAML
        .replace("profile: safe", "profile: dangerous")
        .replace("trading:\n  enabled: false", "trading:\n  enabled: true")
        .replace(
          "    standard:\n      enabled: false\n      allowQuotes: false\n      allowExecutions: false",
          "    standard:\n      enabled: true\n      allowQuotes: true\n      allowExecutions: true",
        ),
    );

    const settings = await loadRuntimeSettings("dangerous");
    const snapshot = await getRuntimeToolSnapshot(settings);
    const managedSwap = snapshot.modelTools.find((toolEntry) => toolEntry.name === "managedSwap");

    expect(managedSwap).toBeDefined();
    expect(managedSwap?.enabledNow).toBe(true);
    expect(managedSwap?.toolDescription).toContain("configured swap provider");
  });

  test("operator-chat lane only exposes allowlisted tools that exist in the snapshot", async () => {
    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeToolSnapshot(settings);
    const operatorNames = getGatewayToolNamesForLane(snapshot, "operator-chat");
    const snapshotNames = new Set(snapshot.modelTools.map((entry) => entry.name));
    const operatorVisibleNames = new Set(
      snapshot.modelTools
        .filter((entry) => (entry.visibility ?? resolveToolVisibility(entry.name)).operatorChat !== "never")
        .map((entry) => entry.name),
    );

    for (const name of operatorNames) {
      expect(operatorVisibleNames.has(name)).toBe(true);
      expect(snapshotNames.has(name)).toBe(true);
    }
  });

  test("workspace-agent lane exposes the full model tool list from the snapshot", async () => {
    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeToolSnapshot(settings);
    const laneNames = getGatewayToolNamesForLane(snapshot, "workspace-agent").toSorted();
    const snapshotNames = snapshot.modelTools
      .filter((entry) => (entry.visibility ?? resolveToolVisibility(entry.name)).workspaceAgent)
      .map((entry) => entry.name)
      .toSorted();
    expect(laneNames).toEqual(snapshotNames);
  });
});
