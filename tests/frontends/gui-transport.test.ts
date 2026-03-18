import { describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { UIMessage } from "ai";
import { ActionRegistry, InMemoryRuntimeEventBus, InMemoryStateStore } from "../../apps/trenchclaw/src/ai";
import type { RuntimeBootstrap } from "../../apps/trenchclaw/src/runtime/bootstrap";
import { RuntimeGuiTransport } from "../../apps/trenchclaw/src/runtime/gui-transport/runtime-gui-transport";
import { resetSolPriceCacheForTests } from "../../apps/trenchclaw/src/runtime/market/sol-price";
import { runtimeStatePath } from "../helpers/core-paths";

const buildRuntime = (input?: {
  streamImpl?: (
    messages: UIMessage[],
    options?: { headers?: HeadersInit; chatId?: string; sessionId?: string; conversationTitle?: string; abortSignal?: AbortSignal },
  ) => Promise<Response>;
}): RuntimeBootstrap => {
  const stateStore = new InMemoryStateStore();
  const registry = new ActionRegistry();

  const streamImpl =
    input?.streamImpl ??
    (async () =>
      new Response("event: done\ndata: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }));

  return {
    llm: null,
    settings: { profile: "dangerous" } as RuntimeBootstrap["settings"],
    chat: {
      listToolNames: () => [],
      generateText: async () => ({ text: "ok", finishReason: "stop" }),
      stream: streamImpl,
    },
    eventBus: new InMemoryRuntimeEventBus(),
    stateStore,
    scheduler: { start: () => {}, stop: async () => {} } as RuntimeBootstrap["scheduler"],
    dispatcher: {} as RuntimeBootstrap["dispatcher"],
    registry,
    session: null,
    stop: async () => {},
    enqueueJob: async () =>
      ({
        id: "job-1",
        serialNumber: 1,
        botId: "bot-1",
        routineName: "noop",
        status: "pending",
        config: {},
        cyclesCompleted: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }) as Awaited<ReturnType<RuntimeBootstrap["enqueueJob"]>>,
    manageJob: async () =>
      ({
        id: "job-1",
        serialNumber: 1,
        botId: "bot-1",
        routineName: "noop",
        status: "paused",
        config: {},
        cyclesCompleted: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }) as Awaited<ReturnType<RuntimeBootstrap["manageJob"]>>,
    createActionContext: () => ({ actor: "agent" }),
    describe: () => ({
      profile: "dangerous",
      registeredActions: [],
      pendingJobs: 0,
      schedulerTickMs: 1000,
      llmEnabled: true,
      llmModel: "test-model",
    }),
  } as RuntimeBootstrap;
};

describe("Runtime v1 API", () => {
  test("POST /v1/chat/stream delegates to runtime.chat.stream with CORS headers", async () => {
    let callCount = 0;
    let capturedHeaders: HeadersInit | undefined;
    let capturedChatId: string | undefined;
    let capturedAbortSignal: AbortSignal | undefined;

    const runtime = buildRuntime({
      streamImpl: async (_messages, options) => {
        callCount += 1;
        capturedHeaders = options?.headers;
        capturedChatId = options?.chatId;
        capturedAbortSignal = options?.abortSignal;
        return new Response("event: done\ndata: [DONE]\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    });
    const transport = new RuntimeGuiTransport(runtime);
    const handler = transport.createApiHandler();

    const request = new Request("http://localhost/v1/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
          chatId: "chat-v1-1",
        }),
      });
    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(callCount).toBe(1);
    expect(capturedChatId).toBe("chat-v1-1");
    expect(capturedAbortSignal).toBe(request.signal);
    const headers = new Headers(capturedHeaders);
    expect(headers.get("access-control-allow-origin")).toBe("*");
  });

  test("POST /v1/chat/stream rejects invalid payloads with standardized envelope", async () => {
    const runtime = buildRuntime();
    const transport = new RuntimeGuiTransport(runtime);
    const handler = transport.createApiHandler();

    const response = await handler(
      new Request("http://localhost/v1/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: {} }),
      }),
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string; message: string } };
    expect(payload.error.code).toBe("invalid_payload");
    expect(payload.error.message).toContain("Invalid chat payload");
  });

  test("GET /v1/health and /v1/runtime are available", async () => {
    const runtime = buildRuntime();
    const transport = new RuntimeGuiTransport(runtime);
    const handler = transport.createApiHandler();

    const healthResponse = await handler(new Request("http://localhost/v1/health", { method: "GET" }));
    expect(healthResponse.status).toBe(200);
    const healthPayload = (await healthResponse.json()) as { ok: boolean };
    expect(healthPayload.ok).toBe(true);

    const runtimeResponse = await handler(new Request("http://localhost/v1/runtime", { method: "GET" }));
    expect(runtimeResponse.status).toBe(200);
    const runtimePayload = (await runtimeResponse.json()) as { llmEnabled: boolean; version: string };
    expect(runtimePayload.llmEnabled).toBe(true);
    expect(runtimePayload.version).toBe("v1");
  });

  test("GET /api/gui/events streams runtime snapshots over SSE", async () => {
    const runtime = buildRuntime();
    const transport = new RuntimeGuiTransport(runtime);
    const handler = transport.createApiHandler();

    const abortController = new AbortController();
    const response = await handler(
      new Request("http://localhost/api/gui/events", {
        method: "GET",
        signal: abortController.signal,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.body).not.toBeNull();

    const reader = response.body!.getReader();
    let payloadText = "";
    for (let index = 0; index < 8; index += 1) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      payloadText += new TextDecoder().decode(chunk.value);
      if (
        payloadText.includes("event: bootstrap")
        && payloadText.includes("event: queue")
        && payloadText.includes("event: schedule")
        && payloadText.includes("event: activity")
      ) {
        break;
      }
    }

    expect(payloadText).toContain("event: bootstrap");
    expect(payloadText).toContain("event: queue");
    expect(payloadText).toContain("event: schedule");
    expect(payloadText).toContain("event: activity");

    abortController.abort();
    await reader.cancel();
  });

  test("GET /api/gui/sol-price returns the cached runtime price and collapses burst refreshes", async () => {
    const originalFetch = globalThis.fetch;
    let upstreamCallCount = 0;
    resetSolPriceCacheForTests();

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.startsWith("https://api.dexscreener.com/")) {
        return originalFetch(input, init);
      }

      upstreamCallCount += 1;
      return Response.json([
        {
          chainId: "solana",
          pairAddress: "pair-low-liquidity",
          quoteToken: { symbol: "USDC" },
          priceUsd: "140.10",
          liquidity: { usd: 10_000 },
        },
        {
          chainId: "solana",
          pairAddress: "pair-high-liquidity",
          quoteToken: { symbol: "USDC" },
          priceUsd: "141.25",
          liquidity: { usd: 250_000 },
        },
      ]);
    }) as typeof globalThis.fetch;

    try {
      const runtime = buildRuntime();
      const transport = new RuntimeGuiTransport(runtime);
      const handler = transport.createApiHandler();

      const firstResponse = await handler(new Request("http://localhost/api/gui/sol-price", { method: "GET" }));
      const secondResponse = await handler(new Request("http://localhost/api/gui/sol-price", { method: "GET" }));

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
      expect(upstreamCallCount).toBe(1);

      const firstPayload = (await firstResponse.json()) as { priceUsd: number | null; updatedAt: number | null };
      const secondPayload = (await secondResponse.json()) as { priceUsd: number | null; updatedAt: number | null };
      expect(firstPayload.priceUsd).toBe(141.25);
      expect(typeof firstPayload.updatedAt).toBe("number");
      expect(secondPayload.priceUsd).toBe(141.25);
      expect(secondPayload.updatedAt).toBe(firstPayload.updatedAt);
    } finally {
      resetSolPriceCacheForTests();
      globalThis.fetch = originalFetch;
    }
  });

  test("GET /api/gui/schedule returns upcoming recurring jobs", async () => {
    const runtime = buildRuntime();
    const now = Date.now();
    runtime.stateStore.saveJob({
      id: "job-schedule-1",
      serialNumber: 7,
      botId: "bot-schedule-1",
      routineName: "actionSequence",
      status: "pending",
      config: {
        intervalMs: 60_000,
      },
      cyclesCompleted: 0,
      createdAt: now,
      updatedAt: now,
      nextRunAt: now + 60_000,
    });
    const transport = new RuntimeGuiTransport(runtime);
    const handler = transport.createApiHandler();

    const response = await handler(new Request("http://localhost/api/gui/schedule", { method: "GET" }));

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      jobs: Array<{ id: string; serialNumber: number | null; recurring: boolean; intervalMs: number | null }>;
    };
    expect(payload.jobs).toHaveLength(1);
    expect(payload.jobs[0]?.id).toBe("job-schedule-1");
    expect(payload.jobs[0]?.serialNumber).toBe(7);
    expect(payload.jobs[0]?.recurring).toBe(true);
    expect(payload.jobs[0]?.intervalMs).toBe(60_000);
  });

  test("GET /api/gui/schedule returns future jobs in chronological order and excludes ready-now queue items", async () => {
    const runtime = buildRuntime();
    const now = Date.now();

    runtime.stateStore.saveJob({
      id: "job-ready-now",
      serialNumber: 1,
      botId: "bot-ready",
      routineName: "actionSequence",
      status: "pending",
      config: {},
      cyclesCompleted: 0,
      totalCycles: 1,
      createdAt: now,
      updatedAt: now,
      nextRunAt: now,
    });

    runtime.stateStore.saveJob({
      id: "job-future-late",
      serialNumber: 2,
      botId: "bot-late",
      routineName: "actionSequence",
      status: "pending",
      config: {},
      cyclesCompleted: 0,
      totalCycles: 1,
      createdAt: now,
      updatedAt: now,
      nextRunAt: now + 120_000,
    });

    runtime.stateStore.saveJob({
      id: "job-paused-no-time",
      serialNumber: 3,
      botId: "bot-paused",
      routineName: "actionSequence",
      status: "paused",
      config: {},
      cyclesCompleted: 0,
      totalCycles: 1,
      createdAt: now - 5_000,
      updatedAt: now - 5_000,
    });

    runtime.stateStore.saveJob({
      id: "job-future-early",
      serialNumber: 4,
      botId: "bot-early",
      routineName: "actionSequence",
      status: "pending",
      config: {},
      cyclesCompleted: 0,
      totalCycles: 1,
      createdAt: now,
      updatedAt: now,
      nextRunAt: now + 60_000,
    });

    const transport = new RuntimeGuiTransport(runtime);
    const handler = transport.createApiHandler();
    const response = await handler(new Request("http://localhost/api/gui/schedule", { method: "GET" }));

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      jobs: Array<{ id: string }>;
    };

    expect(payload.jobs.map((job) => job.id)).toEqual([
      "job-future-early",
      "job-future-late",
      "job-paused-no-time",
    ]);
  });

  test("GET /api/gui/llm/check reports active key metadata", async () => {
    const previous = process.env.TRENCHCLAW_LLM_CHECK_SKIP_PROBE;
    process.env.TRENCHCLAW_LLM_CHECK_SKIP_PROBE = "1";
    try {
      const runtime = buildRuntime();
      const transport = new RuntimeGuiTransport(runtime);
      const handler = transport.createApiHandler();

      const response = await handler(new Request("http://localhost/api/gui/llm/check", { method: "GET" }));
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        provider: string | null;
        keySource: "vault" | "env" | "none";
        keyConfigured: boolean;
        keyLength: number;
        keyFingerprint: string | null;
        probeMessage: string;
      };

      expect(payload.keySource === "vault" || payload.keySource === "env" || payload.keySource === "none").toBe(true);
      expect(typeof payload.keyConfigured).toBe("boolean");
      expect(typeof payload.keyLength).toBe("number");
      expect(typeof payload.probeMessage).toBe("string");
    } finally {
      if (previous === undefined) {
        delete process.env.TRENCHCLAW_LLM_CHECK_SKIP_PROBE;
      } else {
        process.env.TRENCHCLAW_LLM_CHECK_SKIP_PROBE = previous;
      }
    }
  });

  test("GET /api/gui/secrets prunes legacy vault defaults while keeping intentional extra RPC providers", async () => {
    const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
    const instanceId = "97";
    const instancesRoot = runtimeStatePath("instances");
    const instancePath = path.join(instancesRoot, instanceId);
    const vaultPath = path.join(instancePath, "vault.json");
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    try {
      await rm(instancePath, { recursive: true, force: true });
      await mkdir(instancePath, { recursive: true });
      await writeFile(vaultPath, `${JSON.stringify({
        rpc: {
          default: {
            "http-url": "https://api.mainnet-beta.solana.com",
            source: "public",
            "public-id": "solana-mainnet-beta",
          },
          helius: {
            "http-url": "https://kept-custom-rpc.example",
            "ws-url": "wss://kept-custom-rpc.example",
            "api-key": "custom-helius-key",
          },
          quicknode: {
            "http-url": "",
            "ws-url": "",
            "api-key": "",
          },
        },
        llm: {
          openrouter: {
            "api-key": "",
          },
          gateway: {
            "api-key": "",
          },
        },
        integrations: {
          dexscreener: {
            "api-key": "",
          },
          jupiter: {
            "api-key": "",
          },
        },
        wallet: {
          "ultra-signer": {
            "private-key": "remove-me",
            "private-key-encoding": "base64",
          },
        },
      }, null, 2)}\n`);

      const runtime = buildRuntime();
      const transport = new RuntimeGuiTransport(runtime);
      transport.setActiveInstance({
        fileName: "instance.json",
        localInstanceId: instanceId,
        name: "test-instance",
        safetyProfile: "dangerous",
        userPinRequired: false,
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      });
      const handler = transport.createApiHandler();

      const response = await handler(new Request("http://localhost/api/gui/secrets", { method: "GET" }));
      expect(response.status).toBe(200);

      const payload = (await response.json()) as {
        options: Array<{ id: string }>;
        entries: Array<{
          optionId: string;
          value: string;
          source: string;
          rpcProviderId: string | null;
        }>;
        rpcProviderOptions: Array<{ id: string }>;
      };
      expect(payload.options.map((option) => option.id)).toEqual([
        "solana-rpc-url",
        "jupiter-api-key",
        "openrouter-api-key",
        "vercel-ai-gateway-api-key",
      ]);
      expect(payload.rpcProviderOptions.map((option) => option.id)).toEqual([
        "helius",
        "quicknode",
        "shyft",
        "chainstack",
      ]);
      expect(payload.entries.find((entry) => entry.optionId === "solana-rpc-url")).toMatchObject({
        optionId: "solana-rpc-url",
        value: "custom-helius-key",
        source: "public",
        rpcProviderId: "helius",
      });
      expect(payload.entries.find((entry) => entry.optionId === "jupiter-api-key")).toMatchObject({
        optionId: "jupiter-api-key",
        value: "",
        source: "custom",
        rpcProviderId: null,
      });
      expect(payload.entries.some((entry) => entry.optionId === "ultra-signer-private-key")).toBe(false);

      const storedVault = JSON.parse(await readFile(vaultPath, "utf8")) as {
        rpc?: { helius?: unknown; quicknode?: unknown };
        wallet?: { "ultra-signer"?: unknown };
      };
      expect(storedVault.wallet?.["ultra-signer"]).toBeUndefined();
      expect(storedVault.rpc?.quicknode).toBeUndefined();
      expect(storedVault.rpc?.helius).toEqual({
        "http-url": "https://kept-custom-rpc.example",
        "ws-url": "wss://kept-custom-rpc.example",
        "api-key": "custom-helius-key",
      });
    } finally {
      if (previousActiveInstanceId === undefined) {
        delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
      } else {
        process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = previousActiveInstanceId;
      }
      await rm(instancePath, { recursive: true, force: true });
    }
  });

  test("GET /api/gui/secrets does not surface the public Solana endpoint as an RPC credential", async () => {
    const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
    const instanceId = "98";
    const instancesRoot = runtimeStatePath("instances");
    const instancePath = path.join(instancesRoot, instanceId);
    const vaultPath = path.join(instancePath, "vault.json");
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    try {
      await rm(instancePath, { recursive: true, force: true });
      await mkdir(instancePath, { recursive: true });
      await writeFile(vaultPath, `${JSON.stringify({
        rpc: {
          default: {
            "http-url": "https://api.mainnet-beta.solana.com",
            source: "public",
            "public-id": "solana-mainnet-beta",
          },
        },
        llm: {
          openrouter: {
            "api-key": "",
          },
          gateway: {
            "api-key": "",
          },
        },
        integrations: {
          dexscreener: {
            "api-key": "",
          },
          jupiter: {
            "api-key": "",
          },
        },
      }, null, 2)}\n`);

      const runtime = buildRuntime();
      const transport = new RuntimeGuiTransport(runtime);
      transport.setActiveInstance({
        fileName: "instance.json",
        localInstanceId: instanceId,
        name: "test-instance",
        safetyProfile: "dangerous",
        userPinRequired: false,
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      });
      const handler = transport.createApiHandler();

      const response = await handler(new Request("http://localhost/api/gui/secrets", { method: "GET" }));
      expect(response.status).toBe(200);

      const payload = (await response.json()) as {
        entries: Array<{
          optionId: string;
          value: string;
          source: string;
          rpcProviderId: string | null;
        }>;
      };
      expect(payload.entries.find((entry) => entry.optionId === "solana-rpc-url")).toMatchObject({
        optionId: "solana-rpc-url",
        value: "",
        source: "public",
      });
      expect(payload.entries.find((entry) => entry.optionId === "jupiter-api-key")).toMatchObject({
        optionId: "jupiter-api-key",
        value: "",
      });
    } finally {
      if (previousActiveInstanceId === undefined) {
        delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
      } else {
        process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = previousActiveInstanceId;
      }
      await rm(instancePath, { recursive: true, force: true });
    }
  });

  test("GET and PUT /api/gui/ai-settings round-trip ai.json settings", async () => {
    const target = `/tmp/trenchclaw-ai-settings-${crypto.randomUUID()}.json`;
    const previous = process.env.TRENCHCLAW_AI_SETTINGS_FILE;
    process.env.TRENCHCLAW_AI_SETTINGS_FILE = target;
    try {
      const runtime = buildRuntime();
      const transport = new RuntimeGuiTransport(runtime);
      const handler = transport.createApiHandler();

      const initialResponse = await handler(new Request("http://localhost/api/gui/ai-settings", { method: "GET" }));
      expect(initialResponse.status).toBe(200);
      const initialPayload = (await initialResponse.json()) as {
        filePath: string;
        providerOptions: Array<{ id: string }>;
        options: Array<{ id: string; providers: string[] }>;
        settings: { provider: string; model: string };
      };
      expect(initialPayload.filePath).toContain("trenchclaw-ai-settings-");
      expect(initialPayload.settings.provider).toBe("openrouter");
      expect(initialPayload.settings.model).toBe("anthropic/claude-sonnet-4.6");
      expect(initialPayload.providerOptions.map((option) => option.id)).toEqual(["openrouter", "gateway"]);
      expect(initialPayload.options.some((option) => option.id === "openrouter/hunter-alpha")).toBe(true);
      expect(initialPayload.options.find((option) => option.id === "openrouter/hunter-alpha")?.providers).toEqual(["openrouter"]);

      const updateResponse = await handler(new Request("http://localhost/api/gui/ai-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settings: {
            provider: "gateway",
            model: "anthropic/claude-sonnet-4.6",
            defaultMode: "primary",
            temperature: 0.4,
            maxOutputTokens: 2048,
          },
        }),
      }));
      expect(updateResponse.status).toBe(200);
      const updatePayload = (await updateResponse.json()) as {
        providerOptions: Array<{ id: string }>;
        options: Array<{ id: string }>;
        settings: { provider: string; model: string; maxOutputTokens: number | null };
      };
      expect(updatePayload.settings.provider).toBe("gateway");
      expect(updatePayload.settings.model).toBe("anthropic/claude-sonnet-4.6");
      expect(updatePayload.settings.maxOutputTokens).toBe(2048);
      expect(updatePayload.providerOptions.map((option) => option.id)).toEqual(["openrouter", "gateway"]);
      expect(updatePayload.options.some((option) => option.id === "openrouter/hunter-alpha")).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.TRENCHCLAW_AI_SETTINGS_FILE;
      } else {
        process.env.TRENCHCLAW_AI_SETTINGS_FILE = previous;
      }
      await rm(target, { force: true });
    }
  });

  test("GET and PUT /api/gui/trading-settings round-trip instance trading settings", async () => {
    const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
    const instanceId = "98";
    const instanceDirectory = runtimeStatePath("instances", instanceId);
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    try {
      await rm(instanceDirectory, { recursive: true, force: true });

      const runtime = buildRuntime();
      const transport = new RuntimeGuiTransport(runtime);
      transport.setActiveInstance({
        fileName: "instance.json",
        localInstanceId: instanceId,
        name: "test-instance",
        safetyProfile: "dangerous",
        userPinRequired: false,
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      });
      const handler = transport.createApiHandler();

      const initialResponse = await handler(new Request("http://localhost/api/gui/trading-settings", { method: "GET" }));
      expect(initialResponse.status).toBe(200);
      const initialPayload = (await initialResponse.json()) as {
        instanceId: string | null;
        filePath: string | null;
        settings: { defaultSwapProvider: string; defaultSwapMode: string };
      };
      expect(initialPayload.instanceId).toBe(instanceId);
      expect(initialPayload.filePath).toContain(`/instances/${instanceId}/settings/trading.json`);
      expect(initialPayload.settings.defaultSwapProvider).toBe("ultra");
      expect(initialPayload.settings.defaultSwapMode).toBe("ExactIn");

      const updateResponse = await handler(new Request("http://localhost/api/gui/trading-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settings: {
            defaultSwapProvider: "standard",
            defaultSwapMode: "ExactOut",
            defaultAmountUnit: "percent",
            scheduleActionName: "scheduleManagedUltraSwap",
            quickBuyPresets: [],
            customPresets: [],
          },
        }),
      }));
      expect(updateResponse.status).toBe(200);
      const updatePayload = (await updateResponse.json()) as {
        instanceId: string;
        filePath: string;
        settings: { defaultSwapProvider: string; defaultSwapMode: string; defaultAmountUnit: string };
      };
      expect(updatePayload.instanceId).toBe(instanceId);
      expect(updatePayload.filePath).toContain(`/instances/${instanceId}/settings/trading.json`);
      expect(updatePayload.settings.defaultSwapProvider).toBe("standard");
      expect(updatePayload.settings.defaultSwapMode).toBe("ExactOut");
      expect(updatePayload.settings.defaultAmountUnit).toBe("percent");
    } finally {
      if (previousActiveInstanceId === undefined) {
        delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
      } else {
        process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = previousActiveInstanceId;
      }
      await rm(instanceDirectory, { recursive: true, force: true });
    }
  });
});
