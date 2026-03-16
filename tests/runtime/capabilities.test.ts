import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { getRuntimeCapabilitySnapshot } from "../../apps/trenchclaw/src/runtime/capabilities";
import { loadRuntimeSettings } from "../../apps/trenchclaw/src/runtime/load";

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

const TEST_ENV_KEYS = [
  "TRENCHCLAW_SETTINGS_BASE_FILE",
  "TRENCHCLAW_RUNTIME_SETTINGS_FILE",
  "TRENCHCLAW_USER_SETTINGS_FILE",
  "TRENCHCLAW_SETTINGS_USER_FILE",
  "TRENCHCLAW_SETTINGS_AGENT_FILE",
  "TRENCHCLAW_VAULT_FILE",
  "TRENCHCLAW_VAULT_TEMPLATE_FILE",
  "TRENCHCLAW_PROFILE",
] as const;
const initialEnv = Object.fromEntries(TEST_ENV_KEYS.map((key) => [key, process.env[key]]));
const createdFiles: string[] = [];
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
    path: /tmp/trenchclaw-capability-tests.db
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
  const target = `/tmp/trenchclaw-capabilities-${crypto.randomUUID()}.${extension}`;
  await Bun.write(target, content);
  createdFiles.push(target);
  return target;
};

beforeEach(async () => {
  process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile("yaml", TEST_SAFE_SETTINGS_YAML);
  process.env.TRENCHCLAW_RUNTIME_SETTINGS_FILE = await writeTempFile("json", "{}");
  process.env.TRENCHCLAW_USER_SETTINGS_FILE = await writeTempFile("json", "{}");
  delete process.env.TRENCHCLAW_SETTINGS_USER_FILE;
  delete process.env.TRENCHCLAW_SETTINGS_AGENT_FILE;
  delete process.env.TRENCHCLAW_VAULT_FILE;
  delete process.env.TRENCHCLAW_VAULT_TEMPLATE_FILE;
  process.env.TRENCHCLAW_PROFILE = "safe";
});

afterEach(() => {
  for (const key of TEST_ENV_KEYS) {
    const initial = initialEnv[key];
    if (initial === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = initial;
  }

  for (const filePath of createdFiles.splice(0)) {
    void Bun.file(filePath).delete().catch(() => {});
  }
});

describe("runtime capability snapshot", () => {
  test("safe profile exposes read-only workspace tools but not workspace writes", async () => {
    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeCapabilitySnapshot(settings);
    const modelToolNames = snapshot.modelTools.map((toolEntry) => toolEntry.name);

    expect(modelToolNames).toContain("workspaceBash");
    expect(modelToolNames).toContain("workspaceReadFile");
    expect(modelToolNames).not.toContain("workspaceWriteFile");
    expect(modelToolNames).not.toContain("createWallets");
  });

  test("exposes Dexscreener model tools when trading is enabled", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile(
      "yaml",
      TEST_SAFE_SETTINGS_YAML.replace("trading:\n  enabled: false", "trading:\n  enabled: true"),
    );

    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeCapabilitySnapshot(settings);
    const modelToolNames = snapshot.modelTools.map((toolEntry) => toolEntry.name);

    expect(modelToolNames).toEqual(expect.arrayContaining(DEXSCREENER_MODEL_TOOL_NAMES));
  });

  test("hides Dexscreener model tools when the integration is disabled", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile(
      "yaml",
      TEST_SAFE_SETTINGS_YAML
        .replace("trading:\n  enabled: false", "trading:\n  enabled: true")
        .replace("  dexscreener:\n    enabled: true", "  dexscreener:\n    enabled: false"),
    );

    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeCapabilitySnapshot(settings);
    const modelToolNames = snapshot.modelTools.map((toolEntry) => toolEntry.name);

    for (const toolName of DEXSCREENER_MODEL_TOOL_NAMES) {
      expect(modelToolNames).not.toContain(toolName);
    }
  });

  test("exposes transfer to the model only when wallet signing transfers are enabled", async () => {
    const defaultSettings = await loadRuntimeSettings("safe");
    const defaultSnapshot = await getRuntimeCapabilitySnapshot(defaultSettings);
    expect(defaultSnapshot.modelTools.map((toolEntry) => toolEntry.name)).not.toContain("transfer");

    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile(
      "yaml",
      TEST_SAFE_SETTINGS_YAML
        .replace("  enabled: false", "  enabled: true")
        .replace("    allowWalletSigning: false", "    allowWalletSigning: true"),
    );

    const enabledSettings = await loadRuntimeSettings("safe");
    const enabledSnapshot = await getRuntimeCapabilitySnapshot(enabledSettings);
    expect(enabledSnapshot.modelTools.map((toolEntry) => toolEntry.name)).toContain("transfer");
  });
});
