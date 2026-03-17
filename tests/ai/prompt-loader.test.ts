import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { loadSystemPromptPayload, resetPromptLoaderCache } from "../../apps/trenchclaw/src/ai/llm/prompt-loader";

const ENV_KEYS = [
  "TRENCHCLAW_PROMPT_MANIFEST_FILE",
  "TRENCHCLAW_AGENT_MODE",
  "TRENCHCLAW_KNOWLEDGE_MANIFEST_FILE",
  "TRENCHCLAW_KNOWLEDGE_DIR",
  "TRENCHCLAW_WORKSPACE_DIR",
  "TRENCHCLAW_SETTINGS_BASE_FILE",
  "TRENCHCLAW_RUNTIME_SETTINGS_FILE",
  "TRENCHCLAW_VAULT_FILE",
  "TRENCHCLAW_ACTIVE_INSTANCE_ID",
] as const;

const initialEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const createdFiles: string[] = [];
const TEST_BASE_SETTINGS_YAML = `
configVersion: 1
profile: dangerous
network:
  chain: solana
  cluster: mainnet-beta
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
    allowPrivateKeyAccess: true
    allowWalletSigning: true
    allowCreatingWallets: true
    allowDeletingWallets: false
    allowExportingWallets: true
    allowImportingWallets: true
    allowListingWallets: true
    allowShowingWallets: true
    allowUpdatingWallets: true
trading:
  enabled: true
  mode:
    simulation: false
    paperTrading: false
  confirmations:
    requireUserConfirmationForDangerousActions: true
    userConfirmationToken: I_CONFIRM
  limits:
    maxSwapNotionalSol: 100
    maxSingleTransferSol: 10
    maxPriorityFeeLamports: 1000000
    maxSlippageBps: 500
  jupiter:
    ultra:
      enabled: true
      allowQuotes: true
      allowExecutions: true
      allowCancellations: false
    standard:
      enabled: false
      allowQuotes: false
      allowExecutions: false
  dexscreener:
    enabled: true
  programId: null
agent:
  enabled: true
  dangerously:
    allowFilesystemWrites: true
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
    path: /tmp/trenchclaw-prompt-loader-tests.db
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
  const target = `/tmp/trenchclaw-prompt-loader-${crypto.randomUUID()}.${extension}`;
  await Bun.write(target, content);
  createdFiles.push(target);
  return target;
};

beforeEach(async () => {
  process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile("yaml", TEST_BASE_SETTINGS_YAML);
  process.env.TRENCHCLAW_RUNTIME_SETTINGS_FILE = await writeTempFile("json", "{}");
  process.env.TRENCHCLAW_VAULT_FILE = await writeTempFile("json", JSON.stringify({}));
  process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = "01";
});

afterEach(() => {
  resetPromptLoaderCache();
  for (const key of ENV_KEYS) {
    const value = initialEnv[key];
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
  for (const filePath of createdFiles.splice(0)) {
    void Bun.file(filePath).delete().catch(() => {});
  }
});

describe("loadSystemPromptPayload", () => {
  test("builds the default primary runtime contract", async () => {
    const payload = await loadSystemPromptPayload();

    expect(payload.mode).toBe("primary");
    expect(payload.title).toBe("Primary Runtime Contract");
    expect(payload.sections.length).toBe(2);
    expect(payload.systemPrompt).toContain("TrenchClaw System Kernel");
    expect(payload.systemPrompt).toContain("## Runtime Contract");
    expect(payload.systemPrompt).toContain("## Enabled Model Tools");
    expect(payload.systemPrompt).toContain("workspaceBash");
    expect(payload.systemPrompt).toContain("queryRuntimeStore");
    expect(payload.systemPrompt).toContain("queryInstanceMemory");
    expect(payload.systemPrompt).toContain("- active instance: 01");
    expect(payload.systemPrompt).toContain(process.env.TRENCHCLAW_VAULT_FILE ?? "");
    expect(payload.systemPrompt).toContain("workspaceReadFile");
    expect(payload.systemPrompt).toContain(".runtime-state/generated/workspace-context.md");
    expect(payload.systemPrompt).not.toContain("## Prompt Assembly Order");
    expect(payload.systemPrompt).not.toContain("Source:");
    expect(payload.systemPrompt).not.toContain("SQLite SQL Schema Snapshot");
    expect(payload.systemPrompt).not.toContain("injected runtime capability appendix");
    expect(payload.promptFiles.length).toBe(1);
  });

  test("resolves explicit primary mode", async () => {
    const payload = await loadSystemPromptPayload("primary");

    expect(payload.mode).toBe("primary");
    expect(payload.title).toBe("Primary Runtime Contract");
    expect(payload.systemPrompt).toContain("## Runtime Contract");
    expect(payload.systemPrompt).not.toContain("## Knowledge Routing");
  });

  test("throws on unknown modes", async () => {
    await expect(loadSystemPromptPayload("does-not-exist")).rejects.toThrow("Unknown agent mode");
  });
});
