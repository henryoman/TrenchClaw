import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createUIMessageStream, type UIMessage } from "ai";
import { z } from "zod";

import type { ActionDispatcher, ActionResult, LlmClient, RuntimeGateway } from "../../apps/trenchclaw/src/ai";
import type { ActionContext, ActionStep } from "../../apps/trenchclaw/src/ai/runtime/types";
import { ActionRegistry, InMemoryRuntimeEventBus, InMemoryStateStore, createActionContext, createRuntimeGateway } from "../../apps/trenchclaw/src/ai";
import type { RuntimeCapabilitySnapshot } from "../../apps/trenchclaw/src/runtime/capabilities";
import { createRuntimeChatService as createRuntimeChatServiceBase } from "../../apps/trenchclaw/src/runtime/chat";
import { loadRuntimeSettings, resolvePrimaryRuntimeEndpoints } from "../../apps/trenchclaw/src/runtime/load";
import { resetSolPriceCacheForTests } from "../../apps/trenchclaw/src/runtime/market/sol-price";
import { SqliteStateStore } from "../../apps/trenchclaw/src/runtime/storage/sqlite-state-store";
import {
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
} from "../../apps/trenchclaw/src/runtime/workspace-bash";
import { runtimeStatePath } from "../helpers/core-paths";

const makeActionResult = (input: {
  ok: boolean;
  idempotencyKey?: string;
  data?: unknown;
  error?: string;
}): ActionResult => ({
  ok: input.ok,
  retryable: false,
  idempotencyKey: input.idempotencyKey ?? "test-idempotency",
  timestamp: Date.now(),
  durationMs: 1,
  ...(input.data === undefined ? {} : { data: input.data }),
  ...(input.error === undefined ? {} : { error: input.error }),
});

const sqliteDbPaths: string[] = [];
const RUNTIME_DB_DIRECTORY = runtimeStatePath("db");
const RUNTIME_INSTANCE_DIRECTORY = runtimeStatePath("instances");
const createTestDbPath = (): string =>
  path.join(RUNTIME_DB_DIRECTORY, `trenchclaw-chat-runtime-${crypto.randomUUID()}.db`);
const tempInstanceDirectories: string[] = [];
const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
const TEST_ENV_KEYS = [
  "TRENCHCLAW_SETTINGS_BASE_FILE",
  "TRENCHCLAW_RUNTIME_SETTINGS_FILE",
  "TRENCHCLAW_SETTINGS_USER_FILE",
  "TRENCHCLAW_SETTINGS_AGENT_FILE",
  "TRENCHCLAW_VAULT_FILE",
  "TRENCHCLAW_VAULT_TEMPLATE_FILE",
  "TRENCHCLAW_PROFILE",
  "TRENCHCLAW_ACTIVE_INSTANCE_ID",
] as const;
const initialEnv = Object.fromEntries(TEST_ENV_KEYS.map((key) => [key, process.env[key]]));
const createdConfigFiles: string[] = [];
const originalFetch = globalThis.fetch;
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
    path: /tmp/trenchclaw-chat-tests.db
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
const DEFAULT_TEST_SYSTEM_PROMPT = [
  "TrenchClaw System Kernel",
  "## Runtime Contract",
  "## Wallet Summary",
].join("\n\n");
const TEST_WORKSPACE_TOOL_NAMES = [
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
] as const;

const writeTempStructuredFile = async (extension: "yaml" | "json", content: string): Promise<string> => {
  const target = `/tmp/trenchclaw-chat-service-${crypto.randomUUID()}.${extension}`;
  await Bun.write(target, content);
  createdConfigFiles.push(target);
  return target;
};

beforeEach(async () => {
  resetSolPriceCacheForTests();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.dexscreener.com/")) {
      return Response.json([
        {
          chainId: "solana",
          pairAddress: "pair-sol-usdc",
          quoteToken: { symbol: "USDC" },
          priceUsd: "141.25",
          liquidity: { usd: 250_000 },
        },
      ]);
    }
    return originalFetch(input, init);
  }) as typeof globalThis.fetch;
  process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempStructuredFile("yaml", TEST_BASE_SETTINGS_YAML);
  process.env.TRENCHCLAW_RUNTIME_SETTINGS_FILE = await writeTempStructuredFile("json", "{}");
  delete process.env.TRENCHCLAW_SETTINGS_USER_FILE;
  delete process.env.TRENCHCLAW_SETTINGS_AGENT_FILE;
  delete process.env.TRENCHCLAW_VAULT_FILE;
  delete process.env.TRENCHCLAW_VAULT_TEMPLATE_FILE;
  process.env.TRENCHCLAW_PROFILE = "dangerous";
});

const resolveDefaultToolNames = (deps: {
  registry: ActionRegistry;
  capabilitySnapshot?: RuntimeCapabilitySnapshot;
  workspaceToolsEnabled?: boolean;
}): string[] => {
  if (deps.capabilitySnapshot) {
    return deps.capabilitySnapshot.modelTools
      .filter((toolEntry) => toolEntry.kind === "action" || (deps.workspaceToolsEnabled && toolEntry.kind === "workspace-tool"))
      .map((toolEntry) => toolEntry.name)
      .toSorted((left, right) => left.localeCompare(right));
  }

  return [
    ...deps.registry
      .list()
      .filter((entry) => Boolean(deps.registry.get(entry.name)?.inputSchema))
      .map((entry) => entry.name),
    ...(deps.workspaceToolsEnabled ? [...TEST_WORKSPACE_TOOL_NAMES] : []),
  ].toSorted((left, right) => left.localeCompare(right));
};

const createGatewayStub = (deps: {
  registry: ActionRegistry;
  capabilitySnapshot?: RuntimeCapabilitySnapshot;
  workspaceToolsEnabled?: boolean;
}): RuntimeGateway => {
  const toolNames = resolveDefaultToolNames(deps);
  return {
    prepareChatExecution: async () => ({
      kind: "llm",
      lane: "operator-chat",
      provider: "test",
      modelId: "test-model",
      model: {} as never,
      systemPrompt: DEFAULT_TEST_SYSTEM_PROMPT,
      toolNames,
      executionTrace: {
        lane: "operator-chat",
        provider: "test",
        model: "test-model",
        promptChars: DEFAULT_TEST_SYSTEM_PROMPT.length,
        toolCount: toolNames.length,
        toolSteps: 0,
        durationMs: 0,
      },
    }),
    listToolNames: () => toolNames,
    describe: () => ({
      lanes: [
        {
          lane: "operator-chat",
          enabled: true,
          provider: "test",
          model: "test-model",
        },
      ],
    }),
  };
};

const createConfiguredGateway = async (input?: {
  dispatcher?: ActionDispatcher;
  registry?: ActionRegistry;
  eventBus?: InMemoryRuntimeEventBus;
  stateStore?: InMemoryStateStore;
  capabilitySnapshot?: RuntimeCapabilitySnapshot;
}): Promise<RuntimeGateway> => {
  const settings = await loadRuntimeSettings("dangerous");
  const endpoints = resolvePrimaryRuntimeEndpoints(settings);
  const eventBus = input?.eventBus ?? new InMemoryRuntimeEventBus();
  const stateStore = input?.stateStore ?? new InMemoryStateStore();
  return createRuntimeGateway(
    {
      settings,
      endpoints,
      dispatcher:
        input?.dispatcher ??
        ({
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher),
      registry: input?.registry ?? new ActionRegistry(),
      eventBus,
      stateStore,
      resolvedModel: {
        provider: "test",
        model: "test-model",
        languageModel: {} as never,
      },
      capabilitySnapshot: input?.capabilitySnapshot,
      createActionContext: (overrides) =>
        createActionContext({
          actor: overrides?.actor ?? "agent",
          eventBus,
          rpcUrl: endpoints.rpcUrl,
          stateStore,
        }),
    },
  );
};

const createRuntimeChatService = (
  deps: Omit<Parameters<typeof createRuntimeChatServiceBase>[0], "gateway"> & {
    gateway?: RuntimeGateway;
    llm?: LlmClient | null;
    workspaceToolsEnabled?: boolean;
  },
  overrides?: Parameters<typeof createRuntimeChatServiceBase>[1] & {
    resolveStreamingModel?: () => unknown;
  },
) =>
  createRuntimeChatServiceBase(
    {
      ...(() => {
        const { llm: _unusedLlm, ...rest } = deps;
        return rest;
      })(),
      gateway: deps.gateway ?? createGatewayStub(deps),
    },
    overrides
      ? (({ resolveStreamingModel: _unusedResolveStreamingModel, ...rest }) => rest)(overrides)
      : undefined,
  );

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetSolPriceCacheForTests();
  for (const dbPath of sqliteDbPaths.splice(0)) {
    void Bun.file(dbPath).delete().catch(() => {});
    void Bun.file(`${dbPath}-wal`).delete().catch(() => {});
    void Bun.file(`${dbPath}-shm`).delete().catch(() => {});
  }
  for (const directoryPath of tempInstanceDirectories.splice(0)) {
    void rm(directoryPath, { recursive: true, force: true }).catch(() => {});
  }
  if (previousActiveInstanceId === undefined) {
    delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
  } else {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = previousActiveInstanceId;
  }

  for (const key of TEST_ENV_KEYS) {
    const initial = initialEnv[key];
    if (initial === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = initial;
  }
  for (const filePath of createdConfigFiles.splice(0)) {
    void Bun.file(filePath).delete().catch(() => {});
  }
});

describe("RuntimeChatService", () => {
  test("bypasses the model for direct wallet inventory questions", async () => {
    const registry = new ActionRegistry();
    const stateStore = new InMemoryStateStore();
    let streamInvocationCount = 0;
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async (_context: ActionContext, step: ActionStep) => {
            expect(step.actionName).toBe("getManagedWalletContents");
            return {
              results: [
                makeActionResult({
                  ok: true,
                  data: {
                    walletCount: 2,
                    wallets: [
                      {
                        walletGroup: "core-wallets",
                        walletName: "wallet_000",
                        address: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
                      },
                      {
                        walletGroup: "core-wallets",
                        walletName: "wallet_001",
                        address: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9",
                      },
                    ],
                  },
                }),
              ],
              policyHits: [],
            };
          },
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore,
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        streamText: (() => {
          streamInvocationCount += 1;
          throw new Error("model path should not be used for wallet inventory fast path");
        }) as never,
      },
    );

    const response = await service.stream([
      {
        id: "user-fast-wallets-1",
        role: "user",
        parts: [{ type: "text", text: "what wallets do we have" }],
      },
    ], {
      chatId: "chat-fast-wallets-1",
    });

    const body = await response.text();
    expect(streamInvocationCount).toBe(0);
    expect(body).toContain("wallet_000");
    expect(body).toContain("getManagedWalletContents");

    const assistant = stateStore.listChatMessages("chat-fast-wallets-1", 10).find((message) => message.role === "assistant");
    expect(assistant?.content).toContain("We have 2 managed wallets");
    expect(assistant?.content).toContain("wallet_001");
  });

  test("bypasses the model for direct wallet contents questions", async () => {
    const registry = new ActionRegistry();
    const stateStore = new InMemoryStateStore();
    let streamInvocationCount = 0;
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({
            results: [
              makeActionResult({
                ok: true,
                data: {
                  walletCount: 2,
                  wallets: [
                    {
                      walletGroup: "core-wallets",
                      walletName: "wallet_000",
                      address: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
                      balanceSol: 1.5,
                      tokenBalances: [
                        {
                          mintAddress: "So11111111111111111111111111111111111111112",
                          balanceUiString: "1.5",
                        },
                      ],
                    },
                    {
                      walletGroup: "core-wallets",
                      walletName: "wallet_001",
                      address: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9",
                      balanceSol: 0.25,
                      tokenBalances: [],
                    },
                  ],
                },
              }),
            ],
            policyHits: [],
          }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore,
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        streamText: (() => {
          streamInvocationCount += 1;
          throw new Error("model path should not be used for wallet contents fast path");
        }) as never,
      },
    );

    const response = await service.stream([
      {
        id: "user-fast-wallet-contents-1",
        role: "user",
        parts: [{ type: "text", text: "what are the contents of each wallet" }],
      },
    ], {
      chatId: "chat-fast-wallet-contents-1",
    });

    const body = await response.text();
    expect(streamInvocationCount).toBe(0);
    expect(body).toContain("wallet_000");
    expect(body).toContain("1.5 SOL");

    const assistant = stateStore.listChatMessages("chat-fast-wallet-contents-1", 10).find((message) => message.role === "assistant");
    expect(assistant?.content).toContain("Here are the contents for 2 managed wallets");
    expect(assistant?.content).toContain("Token So11111111111111111111111111111111111111112: 1.5");
  });

  test("bypasses the model for varied plain-English wallet questions", async () => {
    const registry = new ActionRegistry();
    const stateStore = new InMemoryStateStore();
    let streamInvocationCount = 0;
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({
            results: [
              makeActionResult({
                ok: true,
                data: {
                  walletCount: 2,
                  wallets: [
                    {
                      walletGroup: "core-wallets",
                      walletName: "wallet_000",
                      address: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
                      balanceSol: 0.037965724,
                      tokenBalances: [
                        {
                          mintAddress: "CxWPdDBqxVo3fnTMRTvNuSrd4gkp78udSrFvkVDBAGS",
                          balanceUiString: "37227.586660486",
                        },
                      ],
                    },
                    {
                      walletGroup: "core-wallets",
                      walletName: "wallet_001",
                      address: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9",
                      balanceSol: 0,
                      tokenBalances: [
                        {
                          mintAddress: "CxWPdDBqxVo3fnTMRTvNuSrd4gkp78udSrFvkVDBAGS",
                          balanceUiString: "0.000000002",
                        },
                      ],
                    },
                  ],
                },
              }),
            ],
            policyHits: [],
          }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore,
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        streamText: (() => {
          streamInvocationCount += 1;
          throw new Error("model path should not be used for plain-English wallet fast path");
        }) as never,
      },
    );
    const walletQuestions = [
      "what do we have in our wallets right now",
      "what's in our wallets",
      "show me our wallet balances",
      "how much do we have in our wallets",
      "wallet update",
    ];

    for (const [index, question] of walletQuestions.entries()) {
      const chatId = `chat-fast-wallet-english-${index}`;
      const response = await service.stream([
        {
          id: `user-fast-wallet-english-${index}`,
          role: "user",
          parts: [{ type: "text", text: question }],
        },
      ], {
        chatId,
      });

      const body = await response.text();
      expect(body).toContain("Here are the contents for 2 managed wallets");
      expect(body).toContain("wallet_000");
      expect(body).toContain("37227.586660486");

      const assistant = stateStore.listChatMessages(chatId, 10).find((message) => message.role === "assistant");
      expect(assistant?.content).toContain("wallet_001");
      expect(assistant?.content).toContain("0.000000002");
    }

    expect(streamInvocationCount).toBe(0);
  });

  test("returns the gateway-configured disabled response when no model is available", async () => {
    const settings = await loadRuntimeSettings("dangerous");
    const endpoints = resolvePrimaryRuntimeEndpoints(settings);
    const registry = new ActionRegistry();
    const eventBus = new InMemoryRuntimeEventBus();
    const stateStore = new InMemoryStateStore();
    const service = createRuntimeChatService({
      dispatcher: {
        dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
      } as unknown as ActionDispatcher,
      registry,
      eventBus,
      stateStore,
      workspaceToolsEnabled: false,
      gateway: createRuntimeGateway({
        settings,
        endpoints,
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus,
        stateStore,
        resolvedModel: {
          provider: null,
          model: null,
          languageModel: null,
        },
        createActionContext: (overrides) =>
          createActionContext({
            actor: overrides?.actor ?? "agent",
            eventBus,
            rpcUrl: endpoints.rpcUrl,
            stateStore,
          }),
      }),
    });

    const response = await service.stream([
      {
        id: "user-llm-disabled-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
    ]);

    expect(await response.text()).toContain("LLM is not configured");
  });

  test("lists only registered actions that define input schemas", () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "withSchema",
      category: "data-based",
      inputSchema: z.object({ value: z.number() }),
      execute: async () => makeActionResult({ ok: true }),
    });
    registry.register({
      name: "withoutSchema",
      category: "data-based",
      execute: async () => makeActionResult({ ok: true }),
    });

    const service = createRuntimeChatService({
      dispatcher: {
        dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
      } as unknown as ActionDispatcher,
      registry,
      eventBus: new InMemoryRuntimeEventBus(),
      stateStore: new InMemoryStateStore(),
      llm: null,
      workspaceToolsEnabled: false,
    });

    expect(service.listToolNames()).toEqual(["withSchema"]);
  });

  test("lists workspace tools when enabled without a capability snapshot", () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "withSchema",
      category: "data-based",
      inputSchema: z.object({ value: z.number() }),
      execute: async () => makeActionResult({ ok: true }),
    });

    const service = createRuntimeChatService({
      dispatcher: {
        dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
      } as unknown as ActionDispatcher,
      registry,
      eventBus: new InMemoryRuntimeEventBus(),
      stateStore: new InMemoryStateStore(),
      llm: null,
      workspaceToolsEnabled: true,
    });

    expect(service.listToolNames()).toEqual([
      "withSchema",
      WORKSPACE_BASH_TOOL_NAME,
      WORKSPACE_READ_FILE_TOOL_NAME,
      WORKSPACE_WRITE_FILE_TOOL_NAME,
    ].toSorted((left, right) => left.localeCompare(right)));
  });

  test("dispatches tool calls through the backend dispatcher during streaming", async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "echo",
      category: "data-based",
      inputSchema: z.object({ value: z.number() }),
      execute: async () => makeActionResult({ ok: true }),
    });

    const dispatchCalls: Array<{
      actor: string | undefined;
      actionName: string;
      input: unknown;
      hasEnqueueJob: boolean;
      hasManageJob: boolean;
    }> = [];
    let capturedSystemPrompt = "";
    const enqueueJob = async () => {
      throw new Error("not used in this test");
    };
    const manageJob = async () => {
      throw new Error("not used in this test");
    };
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async (_ctx: ActionContext, step: ActionStep) => {
            dispatchCalls.push({
              actor: _ctx.actor,
              actionName: step.actionName,
              input: step.input,
              hasEnqueueJob: typeof _ctx.enqueueJob === "function",
              hasManageJob: typeof _ctx.manageJob === "function",
            });
            return {
              results: [makeActionResult({ ok: true, data: { echoed: step.input } })],
              policyHits: [],
            };
          },
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore: new InMemoryStateStore(),
        enqueueJob,
        manageJob,
        llm: {
          provider: "test",
          model: "test-model",
          defaultSystemPrompt: "test system prompt",
          defaultMode: "test",
          generate: async () => ({ text: "ok", finishReason: "stop" }),
          stream: async () => ({ textStream: (async function* () {})(), consumeText: async () => "" }),
        } as unknown as LlmClient,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: ((args: {
          system?: string;
          tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        }) => {
          capturedSystemPrompt = args.system ?? "";
          return {
            toUIMessageStreamResponse: async () => {
              const echoTool = args.tools.echo;
              if (!echoTool) {
                throw new Error("echo tool not registered");
              }
              const payload = await echoTool.execute({ value: 42 });
              return Response.json(payload);
            },
          };
        }) as never,
      },
    );

    const response = await service.stream([]);
    const payload = (await response.json()) as { ok: boolean; data: { echoed: { value: number } } };

    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0]).toEqual({
      actor: "agent",
      actionName: "echo",
      input: { value: 42 },
      hasEnqueueJob: true,
      hasManageJob: true,
    });
    expect(payload.ok).toBe(true);
    expect(payload.data.echoed).toEqual({ value: 42 });
    expect(capturedSystemPrompt).toContain("TrenchClaw System Kernel");
    expect(capturedSystemPrompt).toContain("## Runtime Contract");
    expect(capturedSystemPrompt).toContain("## Wallet Summary");
  });

  test("reuses duplicate tool calls with the same input within a single streamed turn", async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "echo",
      category: "data-based",
      inputSchema: z.object({ value: z.number() }),
      execute: async () => makeActionResult({ ok: true }),
    });

    let dispatchCount = 0;
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async (_ctx: ActionContext, step: ActionStep) => {
            dispatchCount += 1;
            return {
              results: [makeActionResult({ ok: true, data: { echoed: step.input, count: dispatchCount } })],
              policyHits: [],
            };
          },
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore: new InMemoryStateStore(),
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: ((args: {
          tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        }) => ({
          toUIMessageStreamResponse: async () => {
            const echoTool = args.tools.echo;
            if (!echoTool) {
              throw new Error("echo tool not registered");
            }
            const first = await echoTool.execute({ value: 42 });
            const second = await echoTool.execute({ value: 42 });
            return Response.json({ first, second });
          },
        })) as never,
      },
    );

    const response = await service.stream([]);
    const payload = (await response.json()) as {
      first: { data: { count: number } };
      second: { data: { count: number } };
    };

    expect(dispatchCount).toBe(1);
    expect(payload.first.data.count).toBe(1);
    expect(payload.second.data.count).toBe(1);
  });

  test("reuses duplicate tool calls with bigint input within a single streamed turn", async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "echoBigInt",
      category: "data-based",
      inputSchema: z.object({ value: z.bigint() }),
      execute: async () => makeActionResult({ ok: true }),
    });

    let dispatchCount = 0;
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => {
            dispatchCount += 1;
            return {
              results: [makeActionResult({ ok: true, data: { count: dispatchCount } })],
              policyHits: [],
            };
          },
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore: new InMemoryStateStore(),
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: ((args: {
          tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        }) => ({
          toUIMessageStreamResponse: async () => {
            const echoTool = args.tools.echoBigInt;
            if (!echoTool) {
              throw new Error("echoBigInt tool not registered");
            }
            const first = await echoTool.execute({ value: 42n });
            const second = await echoTool.execute({ value: 42n });
            return Response.json({ first, second });
          },
        })) as never,
      },
    );

    const response = await service.stream([]);
    const payload = (await response.json()) as {
      first: { data: { count: number } };
      second: { data: { count: number } };
    };

    expect(dispatchCount).toBe(1);
    expect(payload.first.data.count).toBe(1);
    expect(payload.second.data.count).toBe(1);
  });

  test("registers only capability-snapshot model tools for chat", async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "enabledAction",
      category: "data-based",
      inputSchema: z.object({ value: z.number() }),
      execute: async () => makeActionResult({ ok: true }),
    });
    registry.register({
      name: "disabledAction",
      category: "data-based",
      inputSchema: z.object({ value: z.number() }),
      execute: async () => makeActionResult({ ok: true }),
    });

    let seenToolNames: string[] = [];
    const capabilitySnapshot: RuntimeCapabilitySnapshot = {
      actions: [],
      workspaceTools: [],
      comingSoonFeatures: [],
      modelTools: [
        {
          kind: "action",
          name: "enabledAction",
          description: "enabled action",
          purpose: "enabled action",
          routingHint: "enabled action",
          sideEffectLevel: "read",
          enabledNow: true,
          requiresConfirmation: false,
          exampleInput: { value: 1 },
          toolDescription: "enabled action",
          releaseReadinessStatus: "shipped-now",
          releaseReadinessNote: "Shipped now.",
        },
      ],
    };

    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore: new InMemoryStateStore(),
        capabilitySnapshot,
        llm: {
          provider: "test",
          model: "test-model",
          defaultSystemPrompt: "ignored",
          defaultMode: "primary",
          generate: async () => ({ text: "ok", finishReason: "stop" }),
          stream: async () => ({ textStream: (async function* () {})(), consumeText: async () => "" }),
        } as unknown as LlmClient,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: ((args: { tools: Record<string, { execute: (input: unknown) => Promise<unknown> }> }) => {
          seenToolNames = Object.keys(args.tools).toSorted((left, right) => left.localeCompare(right));
          return {
            toUIMessageStreamResponse: () => new Response("ok"),
          };
        }) as never,
      },
    );

    await service.stream([]);

    expect(service.listToolNames()).toEqual(["enabledAction"]);
    expect(seenToolNames).toEqual(["enabledAction"]);
  });

  test("filters operator-chat tools through the gateway allowlist and excludes workspace tools", async () => {
    const settings = await loadRuntimeSettings("dangerous");
    const endpoints = resolvePrimaryRuntimeEndpoints(settings);
    const eventBus = new InMemoryRuntimeEventBus();
    const stateStore = new InMemoryStateStore();
    const capabilitySnapshot: RuntimeCapabilitySnapshot = {
      actions: [],
      workspaceTools: [],
      comingSoonFeatures: [],
      modelTools: [
        {
          kind: "action",
          name: "queryRuntimeStore",
          description: "query runtime store",
          purpose: "query runtime store",
          routingHint: "query runtime store",
          sideEffectLevel: "read",
          enabledNow: true,
          requiresConfirmation: false,
          exampleInput: { query: "jobs" },
          toolDescription: "query runtime store",
          releaseReadinessStatus: "shipped-now",
          releaseReadinessNote: "Shipped now.",
        },
        {
          kind: "action",
          name: "customActionOutsideAllowlist",
          description: "custom action",
          purpose: "custom action",
          routingHint: "custom action",
          sideEffectLevel: "read",
          enabledNow: true,
          requiresConfirmation: false,
          exampleInput: {},
          toolDescription: "custom action",
          releaseReadinessStatus: "shipped-now",
          releaseReadinessNote: "Shipped now.",
        },
        {
          kind: "action",
          name: "transfer",
          description: "transfer funds",
          purpose: "transfer funds",
          routingHint: "transfer funds",
          sideEffectLevel: "write",
          enabledNow: true,
          requiresConfirmation: true,
          exampleInput: { destination: "dest", amount: "0.1" },
          toolDescription: "transfer funds",
          releaseReadinessStatus: "limited-beta",
          releaseReadinessNote: "Limited beta.",
        },
        {
          kind: "action",
          name: "closeTokenAccount",
          description: "close token account",
          purpose: "close token account",
          routingHint: "close token account",
          sideEffectLevel: "write",
          enabledNow: true,
          requiresConfirmation: true,
          exampleInput: { walletGroup: "core-wallets", walletName: "wallet_001", mintAddress: "mint" },
          toolDescription: "close token account",
          releaseReadinessStatus: "limited-beta",
          releaseReadinessNote: "Limited beta.",
        },
        {
          kind: "workspace-tool",
          name: WORKSPACE_READ_FILE_TOOL_NAME,
          description: "workspace read",
          purpose: "workspace read",
          routingHint: "workspace read",
          sideEffectLevel: "read",
          enabledNow: true,
          requiresConfirmation: false,
          exampleInput: { path: "README.md" },
          toolDescription: "workspace read",
          releaseReadinessStatus: "shipped-now",
          releaseReadinessNote: "Shipped now.",
        },
      ],
    };
    const gateway = createRuntimeGateway({
      settings,
      endpoints,
      dispatcher: {
        dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
      } as unknown as ActionDispatcher,
      registry: new ActionRegistry(),
      eventBus,
      stateStore,
      resolvedModel: {
        provider: "test",
        model: "test-model",
        languageModel: {} as never,
      },
      capabilitySnapshot,
      createActionContext: (overrides) =>
        createActionContext({
          actor: overrides?.actor ?? "agent",
          eventBus,
          rpcUrl: endpoints.rpcUrl,
          stateStore,
        }),
    });

    const service = createRuntimeChatService({
      dispatcher: {
        dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
      } as unknown as ActionDispatcher,
      registry: new ActionRegistry(),
      eventBus,
      stateStore,
      llm: null,
      capabilitySnapshot,
      workspaceToolsEnabled: true,
      gateway,
    });

    expect(service.listToolNames()).toEqual(["closeTokenAccount", "queryRuntimeStore", "transfer"]);
  });

  test("lists exposed wallet mutation tools in the operator prompt summary", async () => {
    const gateway = await createConfiguredGateway({
      capabilitySnapshot: {
        actions: [],
        workspaceTools: [],
        comingSoonFeatures: [],
        modelTools: [
          {
            kind: "action",
            name: "queryRuntimeStore",
            description: "runtime store",
            purpose: "runtime store",
            routingHint: "runtime store",
            sideEffectLevel: "read",
            enabledNow: true,
            requiresConfirmation: false,
            exampleInput: {},
            toolDescription: "runtime store",
            releaseReadinessStatus: "shipped-now",
            releaseReadinessNote: "Shipped now.",
          },
          {
            kind: "action",
            name: "transfer",
            description: "transfer funds",
            purpose: "transfer funds",
            routingHint: "transfer funds",
            sideEffectLevel: "write",
            enabledNow: true,
            requiresConfirmation: true,
            exampleInput: { destination: "dest", amount: "0.1" },
            toolDescription: "transfer funds",
            releaseReadinessStatus: "limited-beta",
            releaseReadinessNote: "Limited beta.",
          },
          {
            kind: "action",
            name: "closeTokenAccount",
            description: "close token account",
            purpose: "close token account",
            routingHint: "close token account",
            sideEffectLevel: "write",
            enabledNow: true,
            requiresConfirmation: true,
            exampleInput: { walletGroup: "core-wallets", walletName: "wallet_001", mintAddress: "mint" },
            toolDescription: "close token account",
            releaseReadinessStatus: "limited-beta",
            releaseReadinessNote: "Limited beta.",
          },
        ],
      },
    });

    const execution = await gateway.prepareChatExecution({
      lane: "operator-chat",
      messages: [
        {
          id: "user-transfer-summary-1",
          role: "user",
          parts: [{ type: "text", text: "can you transfer tokens" }],
        },
      ],
      userMessage: "can you transfer tokens",
    });

    expect(execution.kind).toBe("llm");
    if (execution.kind !== "llm") {
      return;
    }

    expect(execution.systemPrompt).toContain("wallet mutation tools in operator lane: `closeTokenAccount`, `transfer`");
    expect(execution.systemPrompt).toContain("## Live Runtime Context");
    expect(execution.systemPrompt).toContain("current time (UTC, exact minute):");
    expect(execution.systemPrompt).toContain("shared backend SOL/USD snapshot: $141.25");
  });

  test("keeps the operator gateway prompt and tool list compact", async () => {
    const gateway = await createConfiguredGateway({
      capabilitySnapshot: {
        actions: [],
        workspaceTools: [],
        comingSoonFeatures: [],
        modelTools: [
          {
            kind: "action",
            name: "getManagedWalletContents",
            description: "wallet contents",
            purpose: "wallet contents",
            routingHint: "wallet contents",
            sideEffectLevel: "read",
            enabledNow: true,
            requiresConfirmation: false,
            exampleInput: {},
            toolDescription: "wallet contents",
            releaseReadinessStatus: "shipped-now",
            releaseReadinessNote: "Shipped now.",
          },
          {
            kind: "action",
            name: "queryRuntimeStore",
            description: "runtime store",
            purpose: "runtime store",
            routingHint: "runtime store",
            sideEffectLevel: "read",
            enabledNow: true,
            requiresConfirmation: false,
            exampleInput: {},
            toolDescription: "runtime store",
            releaseReadinessStatus: "shipped-now",
            releaseReadinessNote: "Shipped now.",
          },
          {
            kind: "workspace-tool",
            name: WORKSPACE_READ_FILE_TOOL_NAME,
            description: "workspace read",
            purpose: "workspace read",
            routingHint: "workspace read",
            sideEffectLevel: "read",
            enabledNow: true,
            requiresConfirmation: false,
            exampleInput: { path: "README.md" },
            toolDescription: "workspace read",
            releaseReadinessStatus: "shipped-now",
            releaseReadinessNote: "Shipped now.",
          },
        ],
      },
    });

    const execution = await gateway.prepareChatExecution({
      lane: "operator-chat",
      messages: [
        {
          id: "user-budget-1",
          role: "user",
          parts: [{ type: "text", text: "ping runtime" }],
        },
      ],
      userMessage: "ping runtime",
    });

    expect(execution.kind).toBe("llm");
    if (execution.kind !== "llm") {
      return;
    }
    expect(execution.toolNames.length).toBeLessThanOrEqual(12);
    expect(execution.maxToolSteps).toBeUndefined();
    expect(execution.toolNames).toEqual(["getManagedWalletContents", "queryRuntimeStore"]);
    expect(execution.toolNames).not.toContain(WORKSPACE_READ_FILE_TOOL_NAME);
    expect(execution.systemPrompt).toContain("## Knowledge Index");
  });

  test("includes Dexscreener discovery and market-data actions in the normal operator payload", async () => {
    const gateway = await createConfiguredGateway({
      capabilitySnapshot: {
        actions: [],
        workspaceTools: [],
        comingSoonFeatures: [],
        modelTools: [
          {
            kind: "action",
            name: "getDexscreenerLatestTokenProfiles",
            description: "latest token profiles",
            purpose: "latest token profiles",
            routingHint: "scan what is new or trending on Dexscreener",
            sideEffectLevel: "read",
            enabledNow: true,
            requiresConfirmation: false,
            exampleInput: {},
            toolDescription: "latest token profiles",
            releaseReadinessStatus: "shipped-now",
            releaseReadinessNote: "Shipped now.",
          },
          {
            kind: "action",
            name: "getDexscreenerTopTokenBoosts",
            description: "top token boosts",
            purpose: "top token boosts",
            routingHint: "rank what is hottest or most promoted on Dexscreener",
            sideEffectLevel: "read",
            enabledNow: true,
            requiresConfirmation: false,
            exampleInput: {},
            toolDescription: "top token boosts",
            releaseReadinessStatus: "shipped-now",
            releaseReadinessNote: "Shipped now.",
          },
          {
            kind: "action",
            name: "getDexscreenerTokensByChain",
            description: "tokens by chain",
            purpose: "tokens by chain",
            routingHint: "batch-load price and price-change data after token discovery",
            sideEffectLevel: "read",
            enabledNow: true,
            requiresConfirmation: false,
            exampleInput: { tokenAddresses: ["So11111111111111111111111111111111111111112"] },
            toolDescription: "tokens by chain",
            releaseReadinessStatus: "shipped-now",
            releaseReadinessNote: "Shipped now.",
          },
          {
            kind: "action",
            name: "getDexscreenerPairByChainAndPairId",
            description: "pair by pair address",
            purpose: "pair by pair address",
            routingHint: "load one exact pair when you already know the pool address",
            sideEffectLevel: "read",
            enabledNow: true,
            requiresConfirmation: false,
            exampleInput: { pairAddress: "pair111111111111111111111111111111111111111" },
            toolDescription: "pair by pair address",
            releaseReadinessStatus: "shipped-now",
            releaseReadinessNote: "Shipped now.",
          },
          {
            kind: "action",
            name: "getDexscreenerTokenPairsByChain",
            description: "token pairs by token address",
            purpose: "token pairs by token address",
            routingHint: "load pools for one token when you need volume, liquidity, and price-change detail",
            sideEffectLevel: "read",
            enabledNow: true,
            requiresConfirmation: false,
            exampleInput: { tokenAddress: "So11111111111111111111111111111111111111112" },
            toolDescription: "token pairs by token address",
            releaseReadinessStatus: "shipped-now",
            releaseReadinessNote: "Shipped now.",
          },
          {
            kind: "action",
            name: "searchDexscreenerPairs",
            description: "search pairs",
            purpose: "search pairs",
            routingHint: "search exact pair symbols or names",
            sideEffectLevel: "read",
            enabledNow: true,
            requiresConfirmation: false,
            exampleInput: { query: "BONK" },
            toolDescription: "search pairs",
            releaseReadinessStatus: "shipped-now",
            releaseReadinessNote: "Shipped now.",
          },
        ],
      },
    });

    const execution = await gateway.prepareChatExecution({
      lane: "operator-chat",
      messages: [
        {
          id: "user-meme-movers-1",
          role: "user",
          parts: [{ type: "text", text: "what meme coins ripped the hardest today" }],
        },
      ],
      userMessage: "what meme coins ripped the hardest today",
    });

    expect(execution.kind).toBe("llm");
    if (execution.kind !== "llm") {
      return;
    }
    expect(execution.toolNames).toEqual([
      "getDexscreenerLatestTokenProfiles",
      "getDexscreenerPairByChainAndPairId",
      "getDexscreenerTokenPairsByChain",
      "getDexscreenerTokensByChain",
      "getDexscreenerTopTokenBoosts",
      "searchDexscreenerPairs",
    ]);
    expect(execution.systemPrompt).toContain("## Tool Selection Rules");
    expect(execution.systemPrompt).toContain("## Meme Coin Routine");
    expect(execution.systemPrompt).toContain("if the user asks about meme coins, current meme coins, hot meme coins, or trending meme coins: run `getDexscreenerTopTokenBoosts` first");
    expect(execution.systemPrompt).toContain("## Dexscreener Quick Picks");
    expect(execution.systemPrompt).toContain("### `getDexscreenerTokensByChain`");
    expect(execution.systemPrompt).toContain("Pass up to 30 `tokenAddresses`.");
    expect(execution.systemPrompt).toContain("Do not default to `getDexscreenerLatestTokenBoosts` for broad trending questions.");
  });

  test("includes a compact wallet summary in the system prompt", async () => {
    const registry = new ActionRegistry();
    const eventBus = new InMemoryRuntimeEventBus();
    const stateStore = new InMemoryStateStore();
    const instanceId = "97";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });
    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      `${JSON.stringify({
        walletId: "practice-wallets.practice001",
        walletGroup: "practice-wallets",
        walletName: "practice001",
        address: "DhUmVgNRRerCSzMBYseakf1hvVCqhKjd6XGgQzxSsAB5",
        keypairFilePath: path.join(instanceDirectory, "keypairs/practice-wallets/wallet_000.json"),
        walletLabelFilePath: path.join(instanceDirectory, "keypairs/practice-wallets/wallet_000.label.json"),
      })}\n`,
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;
    const gateway = await createConfiguredGateway({
      registry,
      eventBus,
      stateStore,
    });

    let capturedSystemPrompt = "";
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus,
        stateStore,
        llm: {
          provider: "test",
          model: "test-model",
          defaultSystemPrompt: "test system prompt",
          defaultMode: "test",
          generate: async () => ({ text: "ok", finishReason: "stop" }),
          stream: async () => ({ textStream: (async function* () {})(), consumeText: async () => "" }),
        } as unknown as LlmClient,
        gateway,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: ((args: { system?: string }) => {
          capturedSystemPrompt = args.system ?? "";
          return {
            toUIMessageStreamResponse: () => new Response("ok"),
          };
        }) as never,
      },
    );

    await service.stream([]);

    expect(capturedSystemPrompt).toContain("## Wallet Summary");
    expect(capturedSystemPrompt).toContain(`- active instance wallet scope: ${instanceId}`);
    expect(capturedSystemPrompt).toContain("managed wallet count: 1");
    expect(capturedSystemPrompt).toContain("practice-wallets/practice001=DhUmVgNRRerCSzMBYseakf1hvVCqhKjd6XGgQzxSsAB5");
  });

  test("states missing managed wallet libraries directly in the wallet summary", async () => {
    const registry = new ActionRegistry();
    const eventBus = new InMemoryRuntimeEventBus();
    const stateStore = new InMemoryStateStore();
    const instanceId = "98";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(instanceDirectory, { recursive: true });
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;
    const gateway = await createConfiguredGateway({
      registry,
      eventBus,
      stateStore,
    });

    let capturedSystemPrompt = "";
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus,
        stateStore,
        llm: {
          provider: "test",
          model: "test-model",
          defaultSystemPrompt: "test system prompt",
          defaultMode: "test",
          generate: async () => ({ text: "ok", finishReason: "stop" }),
          stream: async () => ({ textStream: (async function* () {})(), consumeText: async () => "" }),
        } as unknown as LlmClient,
        gateway,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: ((args: { system?: string }) => {
          capturedSystemPrompt = args.system ?? "";
          return {
            toUIMessageStreamResponse: () => new Response("ok"),
          };
        }) as never,
      },
    );

    await service.stream([]);

    expect(capturedSystemPrompt).toContain("## Wallet Summary");
    expect(capturedSystemPrompt).toContain("managed wallet status: missing library file");
    expect(capturedSystemPrompt).toContain("use `getManagedWalletContents` for holdings and token balances");
    expect(capturedSystemPrompt).toContain("never read or edit vaults, keypairs, or wallet-library files directly with file tools");
  });

  test("preserves assistant role/history when preparing streaming messages", async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "echo",
      category: "data-based",
      inputSchema: z.object({ value: z.number() }),
      execute: async () => makeActionResult({ ok: true }),
    });
    let capturedMessages: UIMessage[] = [];

    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore: new InMemoryStateStore(),
        llm: {
          provider: "test",
          model: "test-model",
          defaultSystemPrompt: "test system prompt",
          defaultMode: "test",
          generate: async () => ({ text: "ok", finishReason: "stop" }),
          stream: async () => ({ textStream: (async function* () {})(), consumeText: async () => "" }),
        } as unknown as LlmClient,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: (async (messages: Array<Omit<UIMessage, "id">>) => {
          capturedMessages = messages as UIMessage[];
          return [];
        }) as never,
        streamText: (() => ({
          toUIMessageStreamResponse: () => new Response("ok"),
        })) as never,
      },
    );

    await service.stream([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "ping runtime" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "tool-echo", toolCallId: "tool-call-1", state: "output-available", input: { value: 42 }, output: { ok: true } },
          { type: "text", text: "calling tool now" },
        ] as UIMessage["parts"],
      },
    ]);

    expect(capturedMessages).toHaveLength(2);
    expect(capturedMessages[0]?.role).toBe("user");
    expect(capturedMessages[1]?.role).toBe("assistant");
    expect(capturedMessages[1]?.parts[0]).toEqual({
      type: "tool-echo",
      toolCallId: "tool-call-1",
      state: "output-available",
      input: { value: 42 },
      output: { ok: true },
    });
  });

  test("configures abort-safe streamed UI responses", async () => {
    const registry = new ActionRegistry();
    let capturedConsumeSseStream: unknown;
    let capturedGenerateMessageId: (() => string) | undefined;
    let capturedOriginalMessages: UIMessage[] | undefined;

    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore: new InMemoryStateStore(),
        llm: {
          provider: "test",
          model: "test-model",
          defaultSystemPrompt: "test system prompt",
          defaultMode: "test",
          generate: async () => ({ text: "ok", finishReason: "stop" }),
          stream: async () => ({ textStream: (async function* () {})(), consumeText: async () => "" }),
        } as unknown as LlmClient,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: (() => ({
          toUIMessageStreamResponse: (options?: {
            consumeSseStream?: unknown;
            generateMessageId?: () => string;
            originalMessages?: UIMessage[];
          }) => {
            capturedConsumeSseStream = options?.consumeSseStream;
            capturedGenerateMessageId = options?.generateMessageId;
            capturedOriginalMessages = options?.originalMessages;
            return new Response("ok");
          },
        })) as never,
      },
    );

    await service.stream([
      {
        id: "user-reasoning-1",
        role: "user",
        parts: [{ type: "text", text: "show reasoning" }],
      },
    ]);

    expect(typeof capturedConsumeSseStream).toBe("function");
    expect(typeof capturedGenerateMessageId).toBe("function");
    expect(capturedGenerateMessageId?.()).toMatch(/^msg-/);
    expect(capturedOriginalMessages).toHaveLength(1);
  });

  test("creates and persists conversation/messages from streamed chat", async () => {
    const registry = new ActionRegistry();
    const stateStore = new InMemoryStateStore();
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore,
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: ((args: {
          tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
          messages?: UIMessage[];
        }) => {
          return {
            toUIMessageStreamResponse: (options?: {
              originalMessages?: UIMessage[];
              onFinish?: (event: {
                messages: UIMessage[];
                isContinuation: boolean;
                isAborted: boolean;
                responseMessage: UIMessage;
                finishReason?: string;
              }) => void;
            }) => {
              const assistantMessage: UIMessage = {
                id: "assistant-1",
                role: "assistant",
                parts: [{ type: "text", text: "acknowledged" }],
              };
              const original = options?.originalMessages ?? [];
              options?.onFinish?.({
                messages: [...original, assistantMessage],
                isContinuation: false,
                isAborted: false,
                responseMessage: assistantMessage,
                finishReason: "stop",
              });
              return new Response("ok");
            },
          };
        }) as never,
      },
    );

    const messages: UIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "hello runtime" }],
      },
    ];

    await service.stream(messages, {
      chatId: "chat-persist-1",
      sessionId: "session-1234",
      conversationTitle: "Main Thread",
    });

    const conversation = stateStore.getConversation("chat-persist-1");
    expect(conversation).not.toBeNull();
    expect(conversation?.sessionId).toBe("session-1234");
    expect(conversation?.title).toBe("Main Thread");

    const persisted = stateStore.listChatMessages("chat-persist-1", 10);
    expect(persisted.length).toBe(2);
    expect(persisted[0]?.id).toBe("user-1");
    expect(persisted[0]?.content).toContain("hello runtime");
    expect(persisted[1]?.id).toBe("assistant-1");
    expect(persisted[1]?.content).toContain("acknowledged");
  });

  test("persists assistant ui parts for conversation replay", async () => {
    const registry = new ActionRegistry();
    const stateStore = new InMemoryStateStore();
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore,
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: ((args: {
          tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
          messages?: UIMessage[];
        }) => {
          return {
            toUIMessageStreamResponse: (options?: {
              originalMessages?: UIMessage[];
              onFinish?: (event: {
                messages: UIMessage[];
                isContinuation: boolean;
                isAborted: boolean;
                responseMessage: UIMessage;
                finishReason?: string;
              }) => void;
            }) => {
              const assistantMessage: UIMessage = {
                id: "assistant-structured-1",
                role: "assistant",
                parts: [
                  { type: "reasoning", text: "Inspecting wallet state", state: "done" },
                  { type: "text", text: "Wallet state inspected." },
                ],
              };
              const original = options?.originalMessages ?? [];
              options?.onFinish?.({
                messages: [...original, assistantMessage],
                isContinuation: false,
                isAborted: false,
                responseMessage: assistantMessage,
                finishReason: "stop",
              });
              return new Response("ok");
            },
          };
        }) as never,
      },
    );

    await service.stream(
      [
        {
          id: "user-structured-1",
          role: "user",
          parts: [{ type: "text", text: "inspect the wallet" }],
        },
      ],
      { chatId: "chat-structured-1" },
    );

    const assistant = stateStore.listChatMessages("chat-structured-1", 10).find((message) => message.role === "assistant");
    expect(assistant?.metadata?.uiParts).toEqual([
      { type: "reasoning", text: "Inspecting wallet state", state: "done" },
      { type: "text", text: "Wallet state inspected." },
    ]);
  });

  test("persists tool-only assistant messages for replay", async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "echo",
      category: "data-based",
      inputSchema: z.object({ value: z.number() }),
      execute: async () => makeActionResult({ ok: true }),
    });
    const stateStore = new InMemoryStateStore();
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore,
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: (() => ({
          toUIMessageStreamResponse: (options?: {
            originalMessages?: UIMessage[];
            onFinish?: (event: {
              messages: UIMessage[];
              isContinuation: boolean;
              isAborted: boolean;
              responseMessage: UIMessage;
              finishReason?: string;
            }) => void;
          }) => {
            const assistantMessage: UIMessage = {
              id: "assistant-tool-only-1",
              role: "assistant",
              parts: [
                {
                  type: "tool-echo",
                  toolCallId: "tool-only-call-1",
                  state: "output-available",
                  input: { value: 7 },
                  output: { echoed: 7 },
                },
              ] as UIMessage["parts"],
            };
            const original = options?.originalMessages ?? [];
            options?.onFinish?.({
              messages: [...original, assistantMessage],
              isContinuation: false,
              isAborted: false,
              responseMessage: assistantMessage,
              finishReason: "stop",
            });
            return new Response("ok");
          },
        })) as never,
      },
    );

    await service.stream(
      [
        {
          id: "user-tool-only-1",
          role: "user",
          parts: [{ type: "text", text: "run the echo tool" }],
        },
      ],
      { chatId: "chat-tool-only-1" },
    );

    const assistant = stateStore.listChatMessages("chat-tool-only-1", 10).find((message) => message.role === "assistant");
    expect(assistant).toBeDefined();
    expect(assistant?.content).toBe("");
    expect(assistant?.metadata?.uiParts).toEqual([
      {
        type: "tool-echo",
        toolCallId: "tool-only-call-1",
        state: "output-available",
        input: { value: 7 },
        output: { echoed: 7 },
      },
    ]);
  });

  test("forces a second no-tool answer pass when merged streaming ends with only tool parts", async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "echo",
      category: "data-based",
      inputSchema: z.object({ value: z.number() }),
      execute: async () => makeActionResult({ ok: true }),
    });
    const stateStore = new InMemoryStateStore();
    let streamInvocationCount = 0;
    let generateInvocationCount = 0;
    let capturedStreamTimeout:
      | {
          totalMs?: number;
          stepMs?: number;
          chunkMs?: number;
        }
      | undefined;
    let capturedFallbackGenerateTimeout:
      | {
          totalMs?: number;
          stepMs?: number;
          chunkMs?: number;
        }
      | undefined;

    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore,
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: ((args: {
          timeout?: {
            totalMs?: number;
            stepMs?: number;
            chunkMs?: number;
          };
        }) => {
          streamInvocationCount += 1;
          capturedStreamTimeout = args.timeout;
          return {
            toUIMessageStream: (options?: {
              originalMessages?: UIMessage[];
              onFinish?: (event: {
                messages: UIMessage[];
                isContinuation: boolean;
                isAborted: boolean;
                responseMessage?: UIMessage;
                finishReason?: string;
              }) => void;
            }) =>
              createUIMessageStream({
                originalMessages: options?.originalMessages,
                onFinish: (event) => {
                  options?.onFinish?.({
                    ...event,
                    responseMessage: undefined,
                  });
                },
                execute: ({ writer }) => {
                  writer.write({ type: "start", messageId: "assistant-tool-pass-1" });
                  writer.write({ type: "start-step" });
                  writer.write({ type: "tool-input-start", toolCallId: "tool-call-1", toolName: "echo" });
                  writer.write({ type: "tool-input-delta", toolCallId: "tool-call-1", inputTextDelta: "{\"value\":7}" });
                  writer.write({
                    type: "tool-input-available",
                    toolCallId: "tool-call-1",
                    toolName: "echo",
                    input: { value: 7 },
                  });
                  writer.write({
                    type: "tool-output-available",
                    toolCallId: "tool-call-1",
                    output: { echoed: 7 },
                  });
                  writer.write({ type: "finish-step" });
                  writer.write({ type: "finish", finishReason: "stop" });
                },
              }),
            consumeStream: async () => {},
          };
        }) as never,
        generateText: (async (args: {
          timeout?: {
            totalMs?: number;
            stepMs?: number;
            chunkMs?: number;
          };
        }) => {
          generateInvocationCount += 1;
          capturedFallbackGenerateTimeout = args.timeout;
          return {
            text: "Top volume meme coin today is BONK.",
            finishReason: "stop",
            usage: undefined,
          };
        }) as never,
      },
    );

    const response = await service.stream(
      [
        {
          id: "user-tool-recovery-1",
          role: "user",
          parts: [{ type: "text", text: "what meme coins did volume today" }],
        },
      ],
      { chatId: "chat-tool-recovery-1" },
    );

    await response.text();

    expect(streamInvocationCount).toBe(1);
    expect(generateInvocationCount).toBe(1);
    expect(capturedStreamTimeout).toEqual({
      totalMs: 45_000,
      stepMs: 25_000,
      chunkMs: 12_000,
    });
    expect(capturedFallbackGenerateTimeout).toEqual({
      totalMs: 20_000,
      stepMs: 20_000,
    });

    const assistantMessages = stateStore
      .listChatMessages("chat-tool-recovery-1", 10)
      .filter((message) => message.role === "assistant");
    expect(assistantMessages.at(-1)?.content).toContain("Top volume meme coin today is BONK.");
    const uiParts = assistantMessages.at(-1)?.metadata?.uiParts as Array<Record<string, unknown>> | undefined;
    expect(Array.isArray(uiParts)).toBe(true);
    expect(
      uiParts?.some((part) =>
        part.type === "tool-echo"
        && part.toolCallId === "tool-call-1"
        && part.state === "output-available",
      ),
    ).toBe(true);
    expect(
      uiParts?.some((part) =>
        part.type === "text"
        && part.text === "Top volume meme coin today is BONK.",
      ),
    ).toBe(true);
  });

  test("resolves tool-only wallet-content success from streamed tool output without a second model pass", async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "getManagedWalletContents",
      category: "data-based",
      inputSchema: z.object({ walletGroup: z.string().optional(), includeZeroBalances: z.boolean().optional() }),
      execute: async () => makeActionResult({ ok: true }),
    });
    const stateStore = new InMemoryStateStore();
    let generateInvocationCount = 0;

    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore,
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: (() => ({
          toUIMessageStream: (options?: {
            originalMessages?: UIMessage[];
            onFinish?: (event: {
              messages: UIMessage[];
              isContinuation: boolean;
              isAborted: boolean;
              responseMessage?: UIMessage;
              finishReason?: string;
            }) => void;
          }) =>
            createUIMessageStream({
              originalMessages: options?.originalMessages,
              onFinish: (event) => {
                options?.onFinish?.({
                  ...event,
                  responseMessage: undefined,
                });
              },
              execute: ({ writer }) => {
                writer.write({ type: "start", messageId: "assistant-wallet-tool-pass-1" });
                writer.write({ type: "start-step" });
                writer.write({
                  type: "tool-input-start",
                  toolCallId: "wallet-tool-call-1",
                  toolName: "getManagedWalletContents",
                });
                writer.write({
                  type: "tool-input-available",
                  toolCallId: "wallet-tool-call-1",
                  toolName: "getManagedWalletContents",
                  input: { walletGroup: "core-wallets", includeZeroBalances: false },
                });
                writer.write({
                  type: "tool-output-available",
                  toolCallId: "wallet-tool-call-1",
                  output: {
                    ok: true,
                    data: {
                      walletCount: 2,
                      wallets: [
                        {
                          walletName: "wallet_000",
                          address: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
                          balanceSol: 0.037965724,
                          tokenBalances: [
                            {
                              mintAddress: "CxWPdDBqxVo3fnTMRTvNuSrd4gkp78udSrFvkVDBAGS",
                              balanceUiString: "37227.586660487",
                              symbol: null,
                              name: null,
                            },
                          ],
                        },
                        {
                          walletName: "wallet_001",
                          address: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9",
                          balanceSol: 0,
                          tokenBalances: [
                            {
                              mintAddress: "CxWPdDBqxVo3fnTMRTvNuSrd4gkp78udSrFvkVDBAGS",
                              balanceUiString: "0.000000001",
                              symbol: null,
                              name: null,
                            },
                          ],
                        },
                      ],
                    },
                  },
                });
                writer.write({ type: "finish-step" });
                writer.write({ type: "finish", finishReason: "stop" });
              },
            }),
          consumeStream: async () => {},
        })) as never,
        generateText: (async () => {
          generateInvocationCount += 1;
          return {
            text: "should not be called",
            finishReason: "stop",
            usage: undefined,
          };
        }) as never,
      },
    );

    const response = await service.stream(
      [
        {
          id: "user-wallet-tool-only-1",
          role: "user",
          parts: [{ type: "text", text: "what is in core wallets" }],
        },
      ],
      { chatId: "chat-wallet-tool-only-1" },
    );

    await response.text();

    expect(generateInvocationCount).toBe(0);
    const assistantMessages = stateStore
      .listChatMessages("chat-wallet-tool-only-1", 10)
      .filter((message) => message.role === "assistant");
    expect(assistantMessages.at(-1)?.content).toContain("wallet_000");
    expect(assistantMessages.at(-1)?.content).toContain("CxWPdDBqxVo3fnTMRTvNuSrd4gkp78udSrFvkVDBAGS");
    expect(assistantMessages.at(-1)?.content).toContain("37227.586660487");
  });

  test("resolves tool-only wallet-content success even when the model wrote text before the tool call", async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "getManagedWalletContents",
      category: "data-based",
      inputSchema: z.object({ walletGroup: z.string().optional(), includeZeroBalances: z.boolean().optional() }),
      execute: async () => makeActionResult({ ok: true }),
    });
    const stateStore = new InMemoryStateStore();
    let generateInvocationCount = 0;

    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore,
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: (() => ({
          toUIMessageStream: (options?: {
            originalMessages?: UIMessage[];
            onFinish?: (event: {
              messages: UIMessage[];
              isContinuation: boolean;
              isAborted: boolean;
              responseMessage?: UIMessage;
              finishReason?: string;
            }) => void;
          }) =>
            createUIMessageStream({
              originalMessages: options?.originalMessages,
              onFinish: (event) => {
                options?.onFinish?.({
                  ...event,
                  responseMessage: undefined,
                });
              },
              execute: ({ writer }) => {
                writer.write({ type: "start", messageId: "assistant-wallet-tool-preamble-pass-1" });
                writer.write({ type: "text-start", id: "text-preamble-1" });
                writer.write({
                  type: "text-delta",
                  id: "text-preamble-1",
                  delta: "I don't have any tool results from a previous turn to answer from. Let me fetch the wallet contents now.",
                });
                writer.write({ type: "text-end", id: "text-preamble-1" });
                writer.write({ type: "start-step" });
                writer.write({
                  type: "tool-input-start",
                  toolCallId: "wallet-tool-call-preamble-1",
                  toolName: "getManagedWalletContents",
                });
                writer.write({
                  type: "tool-input-available",
                  toolCallId: "wallet-tool-call-preamble-1",
                  toolName: "getManagedWalletContents",
                  input: { includeZeroBalances: false },
                });
                writer.write({
                  type: "tool-output-available",
                  toolCallId: "wallet-tool-call-preamble-1",
                  output: {
                    ok: true,
                    data: {
                      walletCount: 2,
                      wallets: [
                        {
                          walletName: "wallet_000",
                          address: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
                          balanceSol: 0.037955726,
                          tokenBalances: [
                            {
                              mintAddress: "CxWPdDBqxVo3fnTMRTvNuSrd4gkp78udSrFvkVDBAGS",
                              balanceUiString: "37227.586660486",
                            },
                          ],
                        },
                        {
                          walletName: "wallet_001",
                          address: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9",
                          balanceSol: 0,
                          tokenBalances: [
                            {
                              mintAddress: "CxWPdDBqxVo3fnTMRTvNuSrd4gkp78udSrFvkVDBAGS",
                              balanceUiString: "0.000000002",
                            },
                          ],
                        },
                      ],
                    },
                  },
                });
                writer.write({ type: "finish-step" });
                writer.write({ type: "finish", finishReason: "tool-calls" });
              },
            }),
          consumeStream: async () => {},
        })) as never,
        generateText: (async () => {
          generateInvocationCount += 1;
          return {
            text: "should not be called",
            finishReason: "stop",
            usage: undefined,
          };
        }) as never,
      },
    );

    const response = await service.stream(
      [
        {
          id: "user-wallet-tool-preamble-1",
          role: "user",
          parts: [{ type: "text", text: "list our wallets and the contents of each wallet" }],
        },
      ],
      { chatId: "chat-wallet-tool-preamble-1" },
    );

    await response.text();

    expect(generateInvocationCount).toBe(0);
    const assistantMessages = stateStore
      .listChatMessages("chat-wallet-tool-preamble-1", 10)
      .filter((message) => message.role === "assistant");
    expect(assistantMessages.at(-1)?.content).toContain("wallet_000");
    expect(assistantMessages.at(-1)?.content).toContain("37227.586660486");
    expect(assistantMessages.at(-1)?.content).not.toContain("I don't have any tool results from a previous turn");
  });

  test("ignores reasoning chunks when resolving a tool-only completion", async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "transfer",
      category: "wallet-based",
      inputSchema: z.object({ destination: z.string(), amount: z.string() }),
      execute: async () => makeActionResult({ ok: true }),
    });
    const stateStore = new InMemoryStateStore();

    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore,
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: (() => ({
          toUIMessageStream: (options?: {
            originalMessages?: UIMessage[];
            onFinish?: (event: {
              messages: UIMessage[];
              isContinuation: boolean;
              isAborted: boolean;
              responseMessage?: UIMessage;
              finishReason?: string;
            }) => void;
          }) =>
            createUIMessageStream({
              originalMessages: options?.originalMessages,
              onFinish: (event) => {
                options?.onFinish?.({
                  ...event,
                  responseMessage: undefined,
                });
              },
              execute: ({ writer }) => {
                writer.write({ type: "start", messageId: "assistant-transfer-reasoning-pass-1" });
                writer.write({ type: "reasoning-start", id: "reasoning-1" });
                writer.write({ type: "reasoning-delta", id: "reasoning-1", delta: "thinking" });
                writer.write({ type: "reasoning-end", id: "reasoning-1" });
                writer.write({ type: "start-step" });
                writer.write({
                  type: "tool-input-start",
                  toolCallId: "transfer-reasoning-tool-call-1",
                  toolName: "transfer",
                });
                writer.write({
                  type: "tool-input-available",
                  toolCallId: "transfer-reasoning-tool-call-1",
                  toolName: "transfer",
                  input: { walletGroup: "core-wallets", walletName: "wallet_000", amount: "100" },
                });
                writer.write({
                  type: "tool-output-available",
                  toolCallId: "transfer-reasoning-tool-call-1",
                  output: {
                    ok: true,
                    data: {
                      transferType: "spl",
                      sourceAddress: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
                      destination: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9",
                      mintAddress: "CxWPdDBqxVo3fnTMRTvNuSrd4gkp78udSrFvkVDBAGS",
                      amountUi: 100,
                      amountRaw: "100000000000",
                      txSignature: "sig-reasoning-123",
                    },
                  },
                });
                writer.write({ type: "finish-step" });
                writer.write({ type: "finish", finishReason: "tool-calls" });
              },
            }),
          consumeStream: async () => {},
        })) as never,
        generateText: (async () => {
          throw new Error("generateText should not be called");
        }) as never,
      },
    );

    const response = await service.stream(
      [
        {
          id: "user-transfer-reasoning-1",
          role: "user",
          parts: [{ type: "text", text: "transfer 100 tokens" }],
        },
      ],
      { chatId: "chat-transfer-reasoning-1" },
    );

    await response.text();

    const assistantMessages = stateStore
      .listChatMessages("chat-transfer-reasoning-1", 10)
      .filter((message) => message.role === "assistant");
    expect(assistantMessages.at(-1)?.content).toContain("Transfer submitted successfully.");
    expect(assistantMessages.at(-1)?.content).toContain("sig-reasoning-123");
  });

  test("resolves tool-only transfer success from streamed tool output without a second model pass", async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "transfer",
      category: "wallet-based",
      inputSchema: z.object({ destination: z.string(), amount: z.string() }),
      execute: async () => makeActionResult({ ok: true }),
    });
    const stateStore = new InMemoryStateStore();
    let generateInvocationCount = 0;

    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore,
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: (() => ({
          toUIMessageStream: (options?: {
            originalMessages?: UIMessage[];
            onFinish?: (event: {
              messages: UIMessage[];
              isContinuation: boolean;
              isAborted: boolean;
              responseMessage?: UIMessage;
              finishReason?: string;
            }) => void;
          }) =>
            createUIMessageStream({
              originalMessages: options?.originalMessages,
              onFinish: (event) => {
                options?.onFinish?.({
                  ...event,
                  responseMessage: undefined,
                });
              },
              execute: ({ writer }) => {
                writer.write({ type: "start", messageId: "assistant-transfer-tool-pass-1" });
                writer.write({ type: "start-step" });
                writer.write({
                  type: "tool-input-start",
                  toolCallId: "transfer-tool-call-1",
                  toolName: "transfer",
                });
                writer.write({
                  type: "tool-input-available",
                  toolCallId: "transfer-tool-call-1",
                  toolName: "transfer",
                  input: { walletGroup: "core-wallets", walletName: "wallet_000", amount: "0.000000001" },
                });
                writer.write({
                  type: "tool-output-available",
                  toolCallId: "transfer-tool-call-1",
                  output: {
                    ok: true,
                    data: {
                      transferType: "spl",
                      sourceAddress: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
                      destination: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9",
                      mintAddress: "CxWPdDBqxVo3fnTMRTvNuSrd4gkp78udSrFvkVDBAGS",
                      amountUi: 1e-9,
                      amountRaw: "1",
                      txSignature: "sig-123",
                    },
                  },
                });
                writer.write({ type: "finish-step" });
                writer.write({ type: "finish", finishReason: "stop" });
              },
            }),
          consumeStream: async () => {},
        })) as never,
        generateText: (async () => {
          generateInvocationCount += 1;
          return {
            text: "should not be called",
            finishReason: "stop",
            usage: undefined,
          };
        }) as never,
      },
    );

    const response = await service.stream(
      [
        {
          id: "user-transfer-tool-only-1",
          role: "user",
          parts: [{ type: "text", text: "transfer the token" }],
        },
      ],
      { chatId: "chat-transfer-tool-only-1" },
    );

    await response.text();

    expect(generateInvocationCount).toBe(0);
    const assistantMessages = stateStore
      .listChatMessages("chat-transfer-tool-only-1", 10)
      .filter((message) => message.role === "assistant");
    expect(assistantMessages.at(-1)?.content).toContain("Transfer submitted successfully.");
    expect(assistantMessages.at(-1)?.content).toContain("sig-123");
    expect(assistantMessages.at(-1)?.content).toContain("CxWPdDBqxVo3fnTMRTvNuSrd4gkp78udSrFvkVDBAGS");
  });

  test("resolves tool-only wallet-content failures without a second model pass", async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "getManagedWalletContents",
      category: "data-based",
      inputSchema: z.object({ includeZeroBalances: z.boolean().optional() }),
      execute: async () => makeActionResult({ ok: true }),
    });
    const stateStore = new InMemoryStateStore();
    let generateInvocationCount = 0;

    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore,
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: (() => ({
          toUIMessageStream: (options?: {
            originalMessages?: UIMessage[];
            onFinish?: (event: {
              messages: UIMessage[];
              isContinuation: boolean;
              isAborted: boolean;
              responseMessage?: UIMessage;
              finishReason?: string;
            }) => void;
          }) =>
            createUIMessageStream({
              originalMessages: options?.originalMessages,
              onFinish: (event) => {
                options?.onFinish?.({
                  ...event,
                  responseMessage: undefined,
                });
              },
              execute: ({ writer }) => {
                writer.write({ type: "start", messageId: "assistant-tool-fail-pass-1" });
                writer.write({ type: "start-step" });
                writer.write({
                  type: "tool-input-start",
                  toolCallId: "tool-call-rate-limit-1",
                  toolName: "getManagedWalletContents",
                });
                writer.write({
                  type: "tool-input-available",
                  toolCallId: "tool-call-rate-limit-1",
                  toolName: "getManagedWalletContents",
                  input: { includeZeroBalances: false },
                });
                writer.write({
                  type: "tool-output-available",
                  toolCallId: "tool-call-rate-limit-1",
                  output: {
                    ok: false,
                    error: "RPC request failed with status 429: Too many requests for a specific RPC call",
                    retryable: true,
                  },
                });
                writer.write({ type: "finish-step" });
                writer.write({ type: "finish", finishReason: "stop" });
              },
            }),
          consumeStream: async () => {},
        })) as never,
        generateText: (async () => {
          generateInvocationCount += 1;
          return {
            text: "should not be called",
            finishReason: "stop",
            usage: undefined,
          };
        }) as never,
      },
    );

    const response = await service.stream(
      [
        {
          id: "user-tool-fail-wallet-contents-1",
          role: "user",
          parts: [{ type: "text", text: "what are the contents of each wallet" }],
        },
      ],
      { chatId: "chat-tool-fail-wallet-contents-1" },
    );

    await response.text();

    expect(generateInvocationCount).toBe(0);
    const assistant = stateStore
      .listChatMessages("chat-tool-fail-wallet-contents-1", 10)
      .find((message) => message.role === "assistant");
    expect(assistant?.content).toContain("rate-limiting this request");
    expect(assistant?.content).toContain("429 Too Many Requests");
  });

  test("persists chat history in SQLite across store reopen", async () => {
    const dbPath = createTestDbPath();
    sqliteDbPaths.push(dbPath);
    const stateStore = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });
    const registry = new ActionRegistry();
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore,
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: (() => ({
          toUIMessageStreamResponse: (options?: {
            originalMessages?: UIMessage[];
            onFinish?: (event: {
              messages: UIMessage[];
              isContinuation: boolean;
              isAborted: boolean;
              responseMessage: UIMessage;
              finishReason?: string;
            }) => void;
          }) => {
            const assistantMessage: UIMessage = {
              id: "assistant-sqlite-1",
              role: "assistant",
              parts: [{ type: "text", text: "sqlite persisted" }],
            };
            const original = options?.originalMessages ?? [];
            options?.onFinish?.({
              messages: [...original, assistantMessage],
              isContinuation: false,
              isAborted: false,
              responseMessage: assistantMessage,
              finishReason: "stop",
            });
            return new Response("ok");
          },
        })) as never,
      },
    );

    await service.stream(
      [
        {
          id: "user-sqlite-1",
          role: "user",
          parts: [{ type: "text", text: "persist this chat" }],
        },
      ],
      {
        chatId: "chat-sqlite-1",
        sessionId: "session-sqlite-1",
        conversationTitle: "SQLite Thread",
      },
    );
    stateStore.close();

    const reopened = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });
    const conversation = reopened.getConversation("chat-sqlite-1");
    const messages = reopened.listChatMessages("chat-sqlite-1", 10);
    expect(conversation?.sessionId).toBe("session-sqlite-1");
    expect(conversation?.title).toBe("SQLite Thread");
    expect(messages.length).toBe(2);
    expect(messages.some((entry) => entry.id === "user-sqlite-1")).toBe(true);
    expect(messages.some((entry) => entry.id === "assistant-sqlite-1")).toBe(true);
    reopened.close();
  });

  test("maps provider auth failures to explicit runtime chat errors", async () => {
    const registry = new ActionRegistry();
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore: new InMemoryStateStore(),
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: (() => {
          throw new Error("AI_APICallError: User not found.");
        }) as never,
      },
    );

    await expect(
      service.stream([
        {
          id: "user-auth-fail-1",
          role: "user",
          parts: [{ type: "text", text: "hello runtime" }],
        },
      ]),
    ).rejects.toThrow("LLM authentication failed (OpenRouter: User not found).");
  });

  test("maps timeout failures to explicit runtime chat errors", async () => {
    const registry = new ActionRegistry();
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore: new InMemoryStateStore(),
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: (() => {
          throw new Error("stream timed out after waiting for the next chunk");
        }) as never,
      },
    );

    await expect(
      service.stream([
        {
          id: "user-timeout-fail-1",
          role: "user",
          parts: [{ type: "text", text: "hello runtime" }],
        },
      ]),
    ).rejects.toThrow("LLM request timed out before the model finished responding.");
  });

  test("maps structured provider unavailable failures to explicit runtime chat errors", async () => {
    const registry = new ActionRegistry();
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore: new InMemoryStateStore(),
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: (() => {
          throw {
            code: 502,
            message: "Provider returned error",
            metadata: {
              error_type: "provider_unavailable",
            },
          };
        }) as never,
      },
    );

    await expect(
      service.stream([
        {
          id: "user-provider-unavailable-1",
          role: "user",
          parts: [{ type: "text", text: "hello runtime" }],
        },
      ]),
    ).rejects.toThrow("The upstream AI provider is temporarily unavailable (502 provider_unavailable).");
  });

  test("persists error-part-only assistant messages as runtime error text", async () => {
    const registry = new ActionRegistry();
    const stateStore = new InMemoryStateStore();
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async () => ({ results: [makeActionResult({ ok: true })], policyHits: [] }),
        } as unknown as ActionDispatcher,
        registry,
        eventBus: new InMemoryRuntimeEventBus(),
        stateStore,
        llm: null,
        workspaceToolsEnabled: false,
      },
      {
        resolveStreamingModel: () => ({}) as never,
        convertToModelMessages: async () => [],
        streamText: (() => ({
          toUIMessageStreamResponse: (options?: {
            originalMessages?: UIMessage[];
            onFinish?: (event: {
              messages: UIMessage[];
              isContinuation: boolean;
              isAborted: boolean;
              responseMessage: UIMessage;
              finishReason?: string;
            }) => void;
          }) => {
            const assistantMessage = {
              id: "assistant-error-only-1",
              role: "assistant",
              parts: [{ type: "error", errorText: "User not found." }],
            } as unknown as UIMessage;
            const original = options?.originalMessages ?? [];
            options?.onFinish?.({
              messages: [...original, assistantMessage],
              isContinuation: false,
              isAborted: false,
              responseMessage: assistantMessage,
              finishReason: "error",
            });
            return new Response("ok");
          },
        })) as never,
      },
    );

    await service.stream(
      [
        {
          id: "user-error-part-1",
          role: "user",
          parts: [{ type: "text", text: "ping runtime" }],
        },
      ],
      { chatId: "chat-error-part-1" },
    );

    const persisted = stateStore.listChatMessages("chat-error-part-1", 10);
    const assistant = persisted.find((message) => message.role === "assistant");
    expect(assistant).toBeDefined();
    expect(assistant?.content).toContain("Something went wrong: User not found.");
  });
});
