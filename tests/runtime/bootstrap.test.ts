import { afterEach, describe, expect, test } from "bun:test";

import { createActionContext } from "../../src/ai";
import { bootstrapRuntime } from "../../src/runtime/bootstrap";

const REQUIRED_ENV_DEFAULTS: Record<string, string> = {
  RPC_URL: "https://rpc.example",
  WS_URL: "wss://ws.example",
  HELIUS_RPC_URL: "https://helius.example",
  HELIUS_WS_URL: "wss://helius.example",
  QUICKNODE_RPC_URL: "https://quicknode.example",
  QUICKNODE_WS_URL: "wss://quicknode.example",
};

const BASE_SETTINGS_YAML = `
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
        url: \${RPC_URL}
        wsUrl: \${WS_URL}
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
    path: /tmp/trenchclaw-tests.db
    walMode: true
    busyTimeoutMs: 5000
  files:
    enabled: false
    eventsDirectory: /tmp/trenchclaw-events
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
    policyHitsDays: 7
    decisionLogsDays: 7

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

const MUTABLE_ENV_KEYS = [
  "TRENCHCLAW_PROFILE",
  "TRENCHCLAW_SETTINGS_BASE_FILE",
  "TRENCHCLAW_SETTINGS_USER_FILE",
  "TRENCHCLAW_SETTINGS_AGENT_FILE",
  ...Object.keys(REQUIRED_ENV_DEFAULTS),
] as const;

const initialEnv = Object.fromEntries(MUTABLE_ENV_KEYS.map((key) => [key, process.env[key]]));
const createdFiles: string[] = [];

const writeYaml = async (content: string): Promise<string> => {
  const target = `/tmp/trenchclaw-bootstrap-test-${crypto.randomUUID()}.yaml`;
  await Bun.write(target, content);
  createdFiles.push(target);
  return target;
};

const applyDefaultEnv = async (): Promise<void> => {
  for (const [key, value] of Object.entries(REQUIRED_ENV_DEFAULTS)) {
    process.env[key] = value;
  }
  process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeYaml(BASE_SETTINGS_YAML);
};

afterEach(async () => {
  for (const key of MUTABLE_ENV_KEYS) {
    const initial = initialEnv[key];
    if (initial === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = initial;
  }

  for (const filePath of createdFiles.splice(0)) {
    await Bun.$`rm -f ${filePath}`.quiet();
  }
});

describe("bootstrapRuntime", () => {
  test("applies capability-only agent allowlist while preserving user authority for protected keys", async () => {
    await applyDefaultEnv();
    const userSettingsPath = await writeYaml(`
wallet:
  dangerously:
    allowDeletingWallets: false
`);
    const agentSettingsPath = await writeYaml(`
wallet:
  dangerously:
    allowDeletingWallets: true
agent:
  enabled: false
runtime:
  scheduler:
    tickMs: 2468
`);
    process.env.TRENCHCLAW_SETTINGS_USER_FILE = userSettingsPath;
    process.env.TRENCHCLAW_SETTINGS_AGENT_FILE = agentSettingsPath;

    const runtime = await bootstrapRuntime();
    try {
      expect(runtime.settings.wallet.dangerously.allowDeletingWallets).toBe(false);
      expect(runtime.settings.agent.enabled).toBe(false);
      expect(runtime.settings.runtime.scheduler.tickMs).toBe(1000);
    } finally {
      runtime.stop();
    }
  });

  test("blocks createWallets when wallet permission is disabled in user settings", async () => {
    await applyDefaultEnv();
    const userSettingsPath = await writeYaml(`
wallet:
  dangerously:
    allowCreatingWallets: false
`);
    process.env.TRENCHCLAW_SETTINGS_USER_FILE = userSettingsPath;

    const runtime = await bootstrapRuntime();
    try {
      const result = await runtime.dispatcher.dispatchStep(
        createActionContext({ actor: "agent" }),
        {
          actionName: "createWallets",
          input: {
            count: 1,
            includePrivateKey: false,
            privateKeyEncoding: "base64",
            walletLocator: {
              group: "blocked",
              startIndex: 1,
            },
            output: {
              directory: "src/ai/brain/protected/test-blocked/keypairs",
              filePrefix: "blocked",
              includeIndexInFileName: true,
              walletLibraryFile: "src/ai/brain/protected/test-blocked/wallet-library.jsonl",
            },
          },
        },
      );

      expect(result.results[0]?.ok).toBe(false);
      expect(result.results[0]?.error).toContain("disabled by runtime settings");
    } finally {
      runtime.stop();
    }
  });

  test("creates a blockchain alert and persists it", async () => {
    await applyDefaultEnv();

    const runtime = await bootstrapRuntime();
    const alertsFile = `/tmp/trenchclaw-alerts-${crypto.randomUUID()}.json`;
    try {
      const result = await runtime.dispatcher.dispatchStep(
        createActionContext({ actor: "agent" }),
        {
          actionName: "createBlockchainAlert",
          input: {
            assetSymbol: "SOL",
            condition: {
              type: "priceAbove",
              threshold: 250,
            },
            notification: {
              channels: ["log"],
              cooldownMinutes: 5,
            },
            storageFilePath: alertsFile,
          },
        },
      );

      expect(result.results[0]?.ok).toBe(true);
      expect(result.results[0]?.data).toMatchObject({
        storageFilePath: alertsFile,
        alert: {
          assetSymbol: "SOL",
          condition: {
            type: "priceAbove",
            threshold: 250,
          },
          notification: {
            channels: ["log"],
            cooldownMinutes: 5,
          },
          status: "active",
        },
      });

      const persisted = JSON.parse(await Bun.file(alertsFile).text()) as unknown[];
      expect(Array.isArray(persisted)).toBe(true);
      expect(persisted).toHaveLength(1);
    } finally {
      runtime.stop();
      await Bun.$`rm -f ${alertsFile}`.quiet();
    }
  });

  test("requires explicit confirmation for dangerous swap actions in dangerous profile", async () => {
    await applyDefaultEnv();
    process.env.TRENCHCLAW_PROFILE = "dangerous";

    const runtime = await bootstrapRuntime();
    try {
      const blocked = await runtime.dispatcher.dispatchStep(
        createActionContext({ actor: "agent" }),
        {
          actionName: "ultraSwap",
          input: {},
        },
      );

      expect(blocked.results[0]?.ok).toBe(false);
      expect(blocked.results[0]?.error).toContain("requires explicit user confirmation");

      const unblockedByToken = await runtime.dispatcher.dispatchStep(
        createActionContext({ actor: "agent" }),
        {
          actionName: "ultraSwap",
          input: {
            userConfirmationToken: "I_CONFIRM",
          },
        },
      );

      expect(unblockedByToken.results[0]?.error ?? "").not.toContain("requires explicit user confirmation");
    } finally {
      runtime.stop();
    }
  });
});
