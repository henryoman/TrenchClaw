import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UIMessage } from "ai";
import { z } from "zod";

import type { ActionDispatcher, ActionResult, LlmClient, RuntimeGateway } from "../../apps/trenchclaw/src/ai";
import type { ActionContext, ActionStep } from "../../apps/trenchclaw/src/ai/runtime/types";
import { ActionRegistry, InMemoryRuntimeEventBus, InMemoryStateStore, createActionContext, createRuntimeGateway } from "../../apps/trenchclaw/src/ai";
import type { RuntimeCapabilitySnapshot } from "../../apps/trenchclaw/src/runtime/capabilities";
import { createRuntimeChatService as createRuntimeChatServiceBase } from "../../apps/trenchclaw/src/runtime/chat";
import { loadRuntimeSettings, resolvePrimaryRuntimeEndpoints } from "../../apps/trenchclaw/src/runtime/load";
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
  "TRENCHCLAW_USER_SETTINGS_FILE",
  "TRENCHCLAW_SETTINGS_USER_FILE",
  "TRENCHCLAW_SETTINGS_AGENT_FILE",
  "TRENCHCLAW_VAULT_FILE",
  "TRENCHCLAW_VAULT_TEMPLATE_FILE",
  "TRENCHCLAW_PROFILE",
  "TRENCHCLAW_ACTIVE_INSTANCE_ID",
] as const;
const initialEnv = Object.fromEntries(TEST_ENV_KEYS.map((key) => [key, process.env[key]]));
const createdConfigFiles: string[] = [];
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
  process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempStructuredFile("yaml", TEST_BASE_SETTINGS_YAML);
  process.env.TRENCHCLAW_RUNTIME_SETTINGS_FILE = await writeTempStructuredFile("json", "{}");
  process.env.TRENCHCLAW_USER_SETTINGS_FILE = await writeTempStructuredFile("json", "{}");
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
      maxOutputTokens: 450,
      temperature: 0.1,
      maxToolSteps: 6,
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

  test("returns a direct configuration error when the selected model is not approved for operator chat", async () => {
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
          provider: "openrouter",
          model: "stepfun/step-3.5-flash:free",
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
        id: "user-unsupported-model-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
    ]);

    expect(await response.text()).toContain("not approved for operator chat");
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

    expect(service.listToolNames()).toEqual(["queryRuntimeStore"]);
  });

  test("keeps the operator gateway prompt and tool budget compact", async () => {
    const gateway = await createConfiguredGateway({
      capabilitySnapshot: {
        actions: [],
        workspaceTools: [],
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
    expect(execution.systemPrompt.length).toBeLessThanOrEqual(8_000);
    expect(execution.toolNames.length).toBeLessThanOrEqual(12);
    expect(execution.maxToolSteps).toBe(6);
    expect(execution.toolNames).toEqual(["getManagedWalletContents", "queryRuntimeStore"]);
    expect(execution.toolNames).not.toContain(WORKSPACE_READ_FILE_TOOL_NAME);
  });

  test("includes Dexscreener discovery and market-data actions in the normal operator payload", async () => {
    const gateway = await createConfiguredGateway({
      capabilitySnapshot: {
        actions: [],
        workspaceTools: [],
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
    expect(execution.systemPrompt).toContain(
      "use `getDexscreenerPairByChainAndPairId`, `getDexscreenerTokenPairsByChain`, or `getDexscreenerTokensByChain`",
    );
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
