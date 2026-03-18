import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";

import { createActionContext } from "../../apps/trenchclaw/src/ai";
import { bootstrapRuntime } from "../../apps/trenchclaw/src/runtime/bootstrap";
import { loadRuntimeSettings } from "../../apps/trenchclaw/src/runtime/load";
import { runtimeStatePath } from "../helpers/core-paths";

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
    path: /tmp/trenchclaw-tests.db
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

const MUTABLE_ENV_KEYS = [
  "TRENCHCLAW_PROFILE",
  "TRENCHCLAW_SETTINGS_BASE_FILE",
  "TRENCHCLAW_SETTINGS_USER_FILE",
  "TRENCHCLAW_SETTINGS_AGENT_FILE",
  "TRENCHCLAW_AI_SETTINGS_FILE",
  "TRENCHCLAW_BOOT_REFRESH_CONTEXT",
  "TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE",
  "TRENCHCLAW_VAULT_FILE",
  "TRENCHCLAW_VAULT_TEMPLATE_FILE",
  "TRENCHCLAW_RUNTIME_SETTINGS_FILE",
  "TRENCHCLAW_ACTIVE_INSTANCE_ID",
] as const;

const initialEnv = Object.fromEntries(MUTABLE_ENV_KEYS.map((key) => [key, process.env[key]]));
const createdFiles: string[] = [];

const writeYaml = async (content: string): Promise<string> => {
  const target = `/tmp/trenchclaw-bootstrap-test-${crypto.randomUUID()}.yaml`;
  await Bun.write(target, content);
  createdFiles.push(target);
  return target;
};

const writeJson = async (content: unknown): Promise<string> => {
  const target = `/tmp/trenchclaw-bootstrap-test-${crypto.randomUUID()}.json`;
  await Bun.write(target, JSON.stringify(content, null, 2));
  createdFiles.push(target);
  return target;
};

const applyDefaultEnv = async (): Promise<void> => {
  process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeYaml(BASE_SETTINGS_YAML);
  process.env.TRENCHCLAW_RUNTIME_SETTINGS_FILE = await writeJson({});
  process.env.TRENCHCLAW_AI_SETTINGS_FILE = await writeJson({
    provider: "openrouter",
    model: "openai/gpt-5.4",
    defaultMode: "primary",
    temperature: null,
    maxOutputTokens: null,
  });
  process.env.TRENCHCLAW_VAULT_FILE = await writeJson({
    llm: {
      openrouter: {
        "api-key": "test-openrouter-key",
      },
    },
  });
  process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = "01";
  delete process.env.TRENCHCLAW_SETTINGS_USER_FILE;
  delete process.env.TRENCHCLAW_SETTINGS_AGENT_FILE;
  delete process.env.TRENCHCLAW_VAULT_TEMPLATE_FILE;
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
  test("loads runtime RPC from resolved vault-backed instance settings", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeYaml(`
configVersion: 1
profile: dangerous
`);
    process.env.TRENCHCLAW_RUNTIME_SETTINGS_FILE = await writeYaml(`
rpc:
  primaryRpc: helius
  providers:
    helius:
      endpointRef: vault://rpc/helius/http-url
      wsEndpointRef: vault://rpc/helius/ws-url
`);
    process.env.TRENCHCLAW_VAULT_FILE = await writeJson({
      rpc: {
        helius: {
          "http-url": "https://vault-helius-rpc.example",
          "ws-url": "wss://vault-helius-rpc.example",
          "api-key": "vault-helius-key",
        },
      },
      integrations: {
        dexscreener: {
          "api-key": "",
        },
        jupiter: {
          "api-key": "vault-jupiter-key",
        },
      },
      wallet: {
        "ultra-signer": {
          "private-key": "",
          "private-key-encoding": "base64",
        },
      },
    });
    const settings = await loadRuntimeSettings("dangerous");
    expect(settings.network.rpc.endpoints[0]?.url).toBe("https://vault-helius-rpc.example");
    expect(settings.network.rpc.endpoints[0]?.wsUrl).toBe("wss://vault-helius-rpc.example");
    expect(settings.trading.jupiter.ultra.enabled).toBe(true);
  });

  test("fails closed when runtime RPC endpoints remain unresolved vault refs", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeYaml(`
configVersion: 1
profile: dangerous
`);
    process.env.TRENCHCLAW_RUNTIME_SETTINGS_FILE = await writeYaml(`
rpc:
  primaryRpc: helius
  providers:
    helius:
      endpointRef: vault://rpc/helius/http-url
      wsEndpointRef: vault://rpc/helius/ws-url
`);
    process.env.TRENCHCLAW_VAULT_FILE = await writeJson({
      integrations: {
        dexscreener: {
          "api-key": "",
        },
        jupiter: {
          "api-key": "vault-jupiter-key",
        },
      },
      wallet: {
        "ultra-signer": {
          "private-key": "",
          "private-key-encoding": "base64",
        },
      },
    });
    await expect(loadRuntimeSettings("dangerous")).rejects.toThrow(
      "must be resolved to a concrete URL before bootstrap",
    );
  });

  test("fails closed when runtime endpoints use an invalid protocol", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeYaml(`
configVersion: 1
profile: dangerous
`);
    process.env.TRENCHCLAW_RUNTIME_SETTINGS_FILE = await writeJson({
      rpc: {
        primaryRpc: "primary",
        providers: {
          primary: {
            endpointRef: "ftp://rpc.example",
            wsEndpointRef: "wss://ws.example",
          },
        },
      },
    });
    delete process.env.TRENCHCLAW_VAULT_FILE;

    await expect(loadRuntimeSettings("dangerous")).rejects.toThrow("must use one of http:, https:");
  });

  test("fails closed on unresolved env-style endpoint placeholders", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeYaml(`
configVersion: 1
profile: dangerous
`);
    process.env.TRENCHCLAW_RUNTIME_SETTINGS_FILE = await writeJson({
      rpc: {
        primaryRpc: "primary",
        providers: {
          primary: {
            endpointRef: "${RPC_URL}",
            wsEndpointRef: "${WS_URL}",
          },
        },
      },
    });
    await expect(loadRuntimeSettings("dangerous")).rejects.toThrow("cannot be parsed as a URL");
  });

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

  test("blocks createWallets when wallet permission is disabled in runtime settings", async () => {
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
            walletName: "blocked001",
            storage: {
              walletGroup: "core-wallets",
              createGroupIfMissing: true,
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

  test("persists future schedule notices into the shared conversation store", async () => {
    await applyDefaultEnv();
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = "01";

    const runtime = await bootstrapRuntime();
    try {
      const now = Date.now();
      runtime.stateStore.saveConversation({
        id: "chat-existing",
        sessionId: "01",
        title: "Operator chat",
        createdAt: now - 1_000,
        updatedAt: now - 1_000,
      });

      await runtime.enqueueJob({
        botId: "bot-scheduled",
        routineName: "actionSequence",
        executeAtUnixMs: now + 60_000,
        config: {},
      });

      const persisted = runtime.stateStore.listChatMessages("chat-existing", 20);
      const notice = persisted.find((message) => message.role === "system");

      expect(notice?.content).toContain("Scheduled actionSequence for bot-scheduled");
      expect(notice?.content).toContain("T");
    } finally {
      runtime.stop();
    }
  });

  test("creates a blockchain alert and persists it", async () => {
    await applyDefaultEnv();

    const runtime = await bootstrapRuntime();
    const alertsFile = path.resolve(
      runtimeStatePath("instances/01/workspace/strategies/.tests"),
      `bootstrap-alerts-${crypto.randomUUID()}.json`,
    );
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
      let blockedError = "";
      try {
        const blocked = await runtime.dispatcher.dispatchStep(
          createActionContext({ actor: "agent" }),
          {
            actionName: "ultraSwap",
            input: {},
          },
        );

        expect(blocked.results[0]?.ok).toBe(false);
        blockedError = blocked.results[0]?.error ?? "";
      } catch (error) {
        blockedError = error instanceof Error ? error.message : String(error);
      }

      expect(
        blockedError.includes("requires explicit user confirmation") ||
          blockedError.includes("is not registered"),
      ).toBe(true);

      if (!blockedError.includes("is not registered")) {
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
      }
    } finally {
      runtime.stop();
    }
  });

  test("recreates missing generated runtime prompt artifacts on bootstrap", async () => {
    await applyDefaultEnv();
    process.env.TRENCHCLAW_BOOT_REFRESH_CONTEXT = "0";
    process.env.TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE = "0";
    await Bun.file(runtimeStatePath("generated/workspace-context.md")).delete().catch(() => {});
    await Bun.file(runtimeStatePath("generated/knowledge-index.md")).delete().catch(() => {});

    const runtime = await bootstrapRuntime();
    try {
      expect(await Bun.file(runtimeStatePath("generated/workspace-context.md")).exists()).toBe(true);
      expect(await Bun.file(runtimeStatePath("generated/knowledge-index.md")).exists()).toBe(true);
    } finally {
      runtime.stop();
    }
  });

  test("exposes gateway lane health through runtime.describe()", async () => {
    await applyDefaultEnv();

    const runtime = await bootstrapRuntime();
    try {
      const description = runtime.describe();
      expect(Array.isArray(description.gatewayLanes)).toBe(true);
      expect(description.gatewayLanes?.some((lane) => lane.lane === "operator-chat")).toBe(true);
    } finally {
      runtime.stop();
    }
  });
});
