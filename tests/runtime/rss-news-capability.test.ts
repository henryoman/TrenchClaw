import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";

import { getRuntimeCapabilitySnapshot } from "../../apps/trenchclaw/src/runtime/capabilities";
import { loadRuntimeSettings } from "../../apps/trenchclaw/src/runtime/load";
import { createPersistedTestInstance } from "../helpers/instance-fixtures";
import { runtimeStatePath } from "../helpers/core-paths";

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
  const target = `/tmp/trenchclaw-rss-news-capabilities-${crypto.randomUUID()}.${extension}`;
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

describe("rss news capability snapshot", () => {
  test("exposes getConfiguredNewsFeeds as a model tool for compact feed discovery", async () => {
    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeCapabilitySnapshot(settings);
    const toolEntry = snapshot.modelTools.find((entry) => entry.name === "getConfiguredNewsFeeds");

    expect(toolEntry).toMatchObject({
      name: "getConfiguredNewsFeeds",
      sideEffectLevel: "read",
      enabledNow: true,
      releaseReadinessStatus: "shipped-now",
    });
    expect(toolEntry?.toolDescription).toContain("feed catalog");
    expect(toolEntry?.toolDescription).toContain("workspace");
    expect(toolEntry?.routingHint).toContain("configured");
  });

  test("exposes getLatestSolanaNews as a model tool with workspace download guidance", async () => {
    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeCapabilitySnapshot(settings);
    const toolEntry = snapshot.modelTools.find((entry) => entry.name === "getLatestSolanaNews");

    expect(toolEntry).toMatchObject({
      name: "getLatestSolanaNews",
      sideEffectLevel: "read",
      enabledNow: true,
      releaseReadinessStatus: "shipped-now",
    });
    expect(toolEntry?.toolDescription).toContain("RSS or Atom feed");
    expect(toolEntry?.toolDescription).toContain("workspace");
    expect(toolEntry?.toolDescription).toContain("news snapshot");
    expect(toolEntry?.routingHint).toContain("configured RSS or Atom feed");
  });
});
