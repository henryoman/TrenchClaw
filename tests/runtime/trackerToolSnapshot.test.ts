import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";

import { getRuntimeToolSnapshot } from "../../apps/trenchclaw/src/tools";
import { loadRuntimeSettings } from "../../apps/trenchclaw/src/runtime/settings";
import { createPersistedTestInstance } from "../helpers/instanceFixtures";
import { runtimeStatePath } from "../helpers/corePaths";

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
    path: /tmp/trenchclaw-tracker-tool-snapshots.db
    walMode: true
    busyTimeoutMs: 5000
  sessions:
    enabled: false
    directory: /tmp/trenchclaw-tracker-sessions
    agentId: test-agent
    source: tests
  memory:
    enabled: false
    directory: /tmp/trenchclaw-tracker-memory
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
  const target = `/tmp/trenchclaw-tracker-tool-snapshots-${crypto.randomUUID()}.${extension}`;
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

describe("tracker tool snapshot", () => {
  test("exposes getWalletTracker as a model tool for tracked wallet discovery", async () => {
    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeToolSnapshot(settings);
    const toolEntry = snapshot.modelTools.find((entry) => entry.name === "getWalletTracker");

    expect(toolEntry).toMatchObject({
      name: "getWalletTracker",
      sideEffectLevel: "read",
      enabledNow: true,
      releaseReadinessStatus: "shipped-now",
    });
    expect(toolEntry?.toolDescription).toContain("tracked wallets");
    expect(toolEntry?.toolDescription).toContain("token mints");
    expect(toolEntry?.routingHint).toContain("tracked");
  });
});
