import { describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { UIMessage } from "ai";
import { ActionRegistry, InMemoryRuntimeEventBus, InMemoryStateStore } from "../../apps/trenchclaw/src/ai";
import type { RuntimeBootstrap } from "../../apps/trenchclaw/src/runtime/bootstrap";
import { RuntimeSurfaceTransport } from "../../apps/trenchclaw/src/runtime/runtime-surface";
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

const ensurePersistedInstance = async (instanceId: string): Promise<string> => {
  const instancesRoot = runtimeStatePath("instances");
  const instancePath = path.join(instancesRoot, instanceId);
  await mkdir(instancePath, { recursive: true });
  await writeFile(
    path.join(instancesRoot, "active-instance.json"),
    `${JSON.stringify({ localInstanceId: instanceId }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(instancePath, "instance.json"),
    `${JSON.stringify({
      instance: {
        name: `instance-${instanceId}`,
        localInstanceId: instanceId,
        userPin: null,
      },
      runtime: {
        safetyProfile: "dangerous",
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z",
      },
    }, null, 2)}\n`,
    "utf8",
  );
  return instancePath;
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
    const transport = new RuntimeSurfaceTransport(runtime);
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
    const transport = new RuntimeSurfaceTransport(runtime);
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

  test("POST /v1/chat/stream tolerates malformed non-text parts by sanitizing them", async () => {
    let capturedMessages: UIMessage[] = [];
    const runtime = buildRuntime({
      streamImpl: async (messages) => {
        capturedMessages = messages;
        return new Response("event: done\ndata: [DONE]\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    });
    const transport = new RuntimeSurfaceTransport(runtime);
    const handler = transport.createApiHandler();

    const response = await handler(
      new Request("http://localhost/v1/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "assistant",
              parts: [
                { type: "step-start" },
                { type: "text", text: "hello there" },
                { type: "reasoning", text: "ignore this" },
              ],
            },
            {
              role: "user",
              parts: [{ type: "text", text: "continue" }],
            },
          ],
          chatId: "chat-v1-sanitize",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(capturedMessages).toHaveLength(2);
    expect(capturedMessages[0]?.role).toBe("assistant");
    expect(capturedMessages[0]?.parts).toEqual([{ type: "text", text: "hello there" }]);
    expect(capturedMessages[1]?.role).toBe("user");
    expect(capturedMessages[1]?.parts).toEqual([{ type: "text", text: "continue" }]);
  });

  test("GET /v1/health and /v1/runtime are available", async () => {
    const runtime = buildRuntime();
    const transport = new RuntimeSurfaceTransport(runtime);
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

  test("GET /v1/app/events streams runtime snapshots over SSE", async () => {
    const runtime = buildRuntime();
    const transport = new RuntimeSurfaceTransport(runtime);
    const handler = transport.createApiHandler();

    const abortController = new AbortController();
    const response = await handler(
      new Request("http://localhost/v1/app/events", {
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

  test("GET /v1/app/events pushes live activity updates after addActivity", async () => {
    const runtime = buildRuntime();
    const transport = new RuntimeSurfaceTransport(runtime);
    const handler = transport.createApiHandler();

    const abortController = new AbortController();
    const response = await handler(
      new Request("http://localhost/v1/app/events", {
        method: "GET",
        signal: abortController.signal,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.body).not.toBeNull();

    const reader = response.body!.getReader();
    let payloadText = "";
    for (let index = 0; index < 8; index += 1) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      payloadText += new TextDecoder().decode(chunk.value);
      if (payloadText.includes("event: activity")) {
        break;
      }
    }

    transport.addActivity("chat", "Prompt sent (1 message)");

    let updatedPayloadText = "";
    for (let index = 0; index < 8; index += 1) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      updatedPayloadText += new TextDecoder().decode(chunk.value);
      if (updatedPayloadText.includes("Prompt sent (1 message)")) {
        break;
      }
    }

    expect(updatedPayloadText).toContain("event: activity");
    expect(updatedPayloadText).toContain("Prompt sent (1 message)");

    abortController.abort();
    await reader.cancel();
  });

  test("runtime event bus entries are mirrored into GUI activity", async () => {
    const runtime = buildRuntime();
    const transport = new RuntimeSurfaceTransport(runtime);

    runtime.eventBus.emit("action:start", {
      actionName: "getManagedWalletContents",
      idempotencyKey: "idem-1",
      inputSummary: "{\"includeZeroBalances\":false}",
    });
    runtime.eventBus.emit("action:success", {
      actionName: "getManagedWalletContents",
      idempotencyKey: "idem-1",
      durationMs: 42,
    });
    runtime.eventBus.emit("queue:enqueue", {
      jobId: "job-1",
      serialNumber: 1,
      botId: "bot-1",
      routineName: "actionSequence",
      queueSize: 3,
      queuePosition: 2,
      nextRunAt: Date.now(),
    });

    await Bun.sleep(0);

    expect(transport.getActivityEntries(10).map((entry) => entry.summary)).toEqual([
      "Started getManagedWalletContents: {\"includeZeroBalances\":false}",
      "Completed getManagedWalletContents",
      "Queued actionSequence for bot-1 (2/3)",
    ]);
  });

  test("POST /v1/chat/stream records assistant response lifecycle activity without duplicating chat text", async () => {
    let runtime!: RuntimeBootstrap;
    runtime = buildRuntime({
      streamImpl: async (_messages, options) => {
        const now = Date.now();
        runtime.stateStore.saveConversation({
          id: options?.chatId ?? "chat-response-1",
          title: "Runtime chat",
          createdAt: now,
          updatedAt: now,
        });
        runtime.stateStore.saveChatMessage({
          id: "assistant-1",
          conversationId: options?.chatId ?? "chat-response-1",
          role: "assistant",
          content: "Here is the final answer from the assistant.",
          metadata: {
            uiParts: [{ type: "text", text: "Here is the final answer from the assistant." }],
          },
          createdAt: now,
        });

        return new Response("event: message\ndata: chunk\n\nevent: done\ndata: [DONE]\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    });
    const transport = new RuntimeSurfaceTransport(runtime);
    const handler = transport.createApiHandler();

    const response = await handler(new Request("http://localhost/v1/chat/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
        chatId: "chat-response-1",
      }),
    }));

    expect(response.status).toBe(200);
    await response.text();

    expect(transport.getActivityEntries(10).map((entry) => entry.summary)).toEqual([
      "Prompt sent (1 message)",
      "Assistant response started",
      "Assistant response finished",
    ]);
  });

  test("GET /v1/app/sol-price returns the cached runtime price and collapses burst refreshes", async () => {
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
      const transport = new RuntimeSurfaceTransport(runtime);
      const handler = transport.createApiHandler();

      const firstResponse = await handler(new Request("http://localhost/v1/app/sol-price", { method: "GET" }));
      const secondResponse = await handler(new Request("http://localhost/v1/app/sol-price", { method: "GET" }));

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

  test("GET /v1/app/schedule returns a minimal upcoming schedule surface", async () => {
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
    const transport = new RuntimeSurfaceTransport(runtime);
    const handler = transport.createApiHandler();

    const response = await handler(new Request("http://localhost/v1/app/schedule", { method: "GET" }));

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      jobs: Array<{ id: string; serialNumber: number | null; status: string; nextRunAt: number | null }>;
    };
    expect(payload.jobs).toHaveLength(1);
    expect(payload.jobs[0]?.id).toBe("job-schedule-1");
    expect(payload.jobs[0]?.serialNumber).toBe(7);
    expect(payload.jobs[0]?.status).toBe("upcoming");
    expect(payload.jobs[0]?.nextRunAt).toBe(now + 60_000);
  });

  test("GET /v1/app/schedule returns future jobs in chronological order and excludes ready-now queue items", async () => {
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

    const transport = new RuntimeSurfaceTransport(runtime);
    const handler = transport.createApiHandler();
    const response = await handler(new Request("http://localhost/v1/app/schedule", { method: "GET" }));

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      jobs: Array<{ id: string; status: string }>;
    };

    expect(payload.jobs.map((job) => job.id)).toEqual([
      "job-future-early",
      "job-future-late",
      "job-paused-no-time",
    ]);
    expect(payload.jobs.map((job) => job.status)).toEqual(["upcoming", "upcoming", "paused"]);
  });

  test("POST /v1/app/instances/sign-out clears the active instance session", async () => {
    const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
    const instanceId = "95";
    const instancePath = await ensurePersistedInstance(instanceId);
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    try {
      const runtime = buildRuntime();
      const transport = new RuntimeSurfaceTransport(runtime);
      transport.setActiveInstance({
        fileName: "instance.json",
        localInstanceId: instanceId,
        name: `instance-${instanceId}`,
        safetyProfile: "dangerous",
        userPinRequired: false,
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z",
      });
      transport.setActiveChatId(`chat-${instanceId}`);
      const handler = transport.createApiHandler();

      const response = await handler(new Request("http://localhost/v1/app/instances/sign-out", { method: "POST" }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(transport.getActiveInstance()).toBeNull();
      expect(transport.getActiveChatId()).toBeNull();
      expect(await Bun.file(path.join(runtimeStatePath("instances"), "active-instance.json")).json()).toEqual({ signedOut: true });
    } finally {
      await rm(instancePath, { recursive: true, force: true });
      await rm(path.join(runtimeStatePath("instances"), "active-instance.json"), { force: true });
      if (previousActiveInstanceId === undefined) {
        delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
      } else {
        process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = previousActiveInstanceId;
      }
    }
  });

  test("GET /v1/app/llm/check reports active key metadata", async () => {
    const previous = process.env.TRENCHCLAW_LLM_CHECK_SKIP_PROBE;
    const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
    const instanceId = "96";
    const instancePath = await ensurePersistedInstance(instanceId);
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;
    process.env.TRENCHCLAW_LLM_CHECK_SKIP_PROBE = "1";
    try {
      const runtime = buildRuntime();
      const transport = new RuntimeSurfaceTransport(runtime);
      const handler = transport.createApiHandler();

      const response = await handler(new Request("http://localhost/v1/app/llm/check", { method: "GET" }));
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
      await rm(instancePath, { recursive: true, force: true });
      await rm(path.join(runtimeStatePath("instances"), "active-instance.json"), { force: true });
      if (previousActiveInstanceId === undefined) {
        delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
      } else {
        process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = previousActiveInstanceId;
      }
      if (previous === undefined) {
        delete process.env.TRENCHCLAW_LLM_CHECK_SKIP_PROBE;
      } else {
        process.env.TRENCHCLAW_LLM_CHECK_SKIP_PROBE = previous;
      }
    }
  });

  test("GET /v1/app/secrets prunes legacy vault defaults while keeping intentional extra RPC providers", async () => {
    const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
    const instanceId = "97";
    const instancesRoot = runtimeStatePath("instances");
    const instancePath = path.join(instancesRoot, instanceId);
    const vaultPath = path.join(instancePath, "secrets", "vault.json");
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    try {
      await rm(instancePath, { recursive: true, force: true });
      await mkdir(path.dirname(vaultPath), { recursive: true });
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
      const transport = new RuntimeSurfaceTransport(runtime);
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

      const response = await handler(new Request("http://localhost/v1/app/secrets", { method: "GET" }));
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
        "dune-api-key",
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

  test("GET /v1/app/secrets does not surface the public Solana endpoint as an RPC credential", async () => {
    const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
    const instanceId = "98";
    const instancesRoot = runtimeStatePath("instances");
    const instancePath = path.join(instancesRoot, instanceId);
    const vaultPath = path.join(instancePath, "secrets", "vault.json");
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    try {
      await rm(instancePath, { recursive: true, force: true });
      await mkdir(path.dirname(vaultPath), { recursive: true });
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
      const transport = new RuntimeSurfaceTransport(runtime);
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

      const response = await handler(new Request("http://localhost/v1/app/secrets", { method: "GET" }));
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

  test("GET and PUT /v1/app/ai-settings round-trip ai.json settings", async () => {
    const target = `/tmp/trenchclaw-ai-settings-${crypto.randomUUID()}.json`;
    const previous = process.env.TRENCHCLAW_AI_SETTINGS_FILE;
    process.env.TRENCHCLAW_AI_SETTINGS_FILE = target;
    try {
      const runtime = buildRuntime();
      const transport = new RuntimeSurfaceTransport(runtime);
      const handler = transport.createApiHandler();

      const initialResponse = await handler(new Request("http://localhost/v1/app/ai-settings", { method: "GET" }));
      expect(initialResponse.status).toBe(200);
      const initialPayload = (await initialResponse.json()) as {
        filePath: string;
        providerOptions: Array<{ id: string }>;
        options: Array<{ id: string; providers: string[] }>;
        settings: { provider: string; model: string };
      };
      expect(initialPayload.filePath).toContain("trenchclaw-ai-settings-");
      expect(initialPayload.settings.provider).toBe("openrouter");
      expect(initialPayload.settings.model).toBe("stepfun/step-3.5-flash:free");
      expect(initialPayload.providerOptions.map((option) => option.id)).toEqual(["openrouter", "gateway"]);
      expect(initialPayload.options.map((option) => option.id)).toEqual(["stepfun/step-3.5-flash:free"]);
      expect(initialPayload.options.find((option) => option.id === "stepfun/step-3.5-flash:free")?.providers).toEqual(["openrouter"]);

      const updateResponse = await handler(new Request("http://localhost/v1/app/ai-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settings: {
            provider: "openrouter",
            model: "anything-else-gets-normalized",
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
      expect(updatePayload.settings.provider).toBe("openrouter");
      expect(updatePayload.settings.model).toBe("stepfun/step-3.5-flash:free");
      expect(updatePayload.settings.maxOutputTokens).toBe(2048);
      expect(updatePayload.providerOptions.map((option) => option.id)).toEqual(["openrouter", "gateway"]);
      expect(updatePayload.options.map((option) => option.id)).toEqual(["stepfun/step-3.5-flash:free"]);
    } finally {
      if (previous === undefined) {
        delete process.env.TRENCHCLAW_AI_SETTINGS_FILE;
      } else {
        process.env.TRENCHCLAW_AI_SETTINGS_FILE = previous;
      }
      await rm(target, { force: true });
    }
  });

  test("GET and PUT /v1/app/trading-settings round-trip instance trading settings", async () => {
    const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
    const instanceId = "98";
    const instanceDirectory = runtimeStatePath("instances", instanceId);
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    try {
      await rm(instanceDirectory, { recursive: true, force: true });

      const runtime = buildRuntime();
      const transport = new RuntimeSurfaceTransport(runtime);
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

      const initialResponse = await handler(new Request("http://localhost/v1/app/trading-settings", { method: "GET" }));
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

      const updateResponse = await handler(new Request("http://localhost/v1/app/trading-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settings: {
            defaultSwapProvider: "standard",
            defaultSwapMode: "ExactOut",
            defaultAmountUnit: "percent",
            scheduleActionName: "scheduleManagedTriggerOrder",
            quickBuyPresets: [],
            customPresets: [],
          },
        }),
      }));
      expect(updateResponse.status).toBe(200);
      const updatePayload = (await updateResponse.json()) as {
        instanceId: string;
        filePath: string;
        settings: {
          defaultSwapProvider: string;
          defaultSwapMode: string;
          defaultAmountUnit: string;
          scheduleActionName: string;
        };
      };
      expect(updatePayload.instanceId).toBe(instanceId);
      expect(updatePayload.filePath).toContain(`/instances/${instanceId}/settings/trading.json`);
      expect(updatePayload.settings.defaultSwapProvider).toBe("standard");
      expect(updatePayload.settings.defaultSwapMode).toBe("ExactOut");
      expect(updatePayload.settings.defaultAmountUnit).toBe("percent");
      expect(updatePayload.settings.scheduleActionName).toBe("scheduleManagedUltraSwap");
    } finally {
      if (previousActiveInstanceId === undefined) {
        delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
      } else {
        process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = previousActiveInstanceId;
      }
      await rm(instanceDirectory, { recursive: true, force: true });
    }
  });

  test("GET and PUT /v1/app/wakeup-settings anchor the next wakeup from save time", async () => {
    const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
    const instanceId = "99";
    const instanceDirectory = runtimeStatePath("instances", instanceId);
    const wakeupSettingsPath = path.join(instanceDirectory, "settings", "wakeup.json");
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    try {
      await rm(instanceDirectory, { recursive: true, force: true });

      const runtime = buildRuntime();
      const transport = new RuntimeSurfaceTransport(runtime);
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

      const initialResponse = await handler(new Request("http://localhost/v1/app/wakeup-settings", { method: "GET" }));
      expect(initialResponse.status).toBe(200);
      const initialPayload = (await initialResponse.json()) as {
        instanceId: string | null;
        filePath: string | null;
        settings: { intervalMinutes: number; prompt: string };
      };
      expect(initialPayload.instanceId).toBe(instanceId);
      expect(initialPayload.filePath).toContain(`/instances/${instanceId}/settings/wakeup.json`);
      expect(initialPayload.settings.intervalMinutes).toBe(0);

      const updateResponse = await handler(new Request("http://localhost/v1/app/wakeup-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settings: {
            intervalMinutes: 15,
            prompt: "IF anything matters, say it. IF not, do nothing.",
          },
        }),
      }));
      expect(updateResponse.status).toBe(200);
      const updatePayload = (await updateResponse.json()) as {
        instanceId: string;
        filePath: string;
        savedAt: string;
        settings: { intervalMinutes: number; prompt: string };
      };
      expect(updatePayload.instanceId).toBe(instanceId);
      expect(updatePayload.filePath).toContain(`/instances/${instanceId}/settings/wakeup.json`);
      expect(updatePayload.settings.intervalMinutes).toBe(15);

      const savedAtUnixMs = Date.parse(updatePayload.savedAt);
      const wakeupJobs = runtime.stateStore
        .listJobs()
        .filter((job) => job.routineName === "runtimeWakeup" && job.status === "pending");
      expect(wakeupJobs).toHaveLength(1);
      expect(wakeupJobs[0]?.nextRunAt).toBe(savedAtUnixMs + 15 * 60_000);
      expect(wakeupJobs[0]?.config.intervalMs).toBe(15 * 60_000);

      const storedSettings = JSON.parse(await readFile(wakeupSettingsPath, "utf8")) as {
        savedAtUnixMs?: number;
        wakeup?: { intervalMinutes?: number };
      };
      expect(storedSettings.savedAtUnixMs).toBe(savedAtUnixMs);
      expect(storedSettings.wakeup?.intervalMinutes).toBe(15);

      const disableResponse = await handler(new Request("http://localhost/v1/app/wakeup-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settings: {
            intervalMinutes: 0,
            prompt: "IF anything matters, say it. IF not, do nothing.",
          },
        }),
      }));
      expect(disableResponse.status).toBe(200);
      expect(
        runtime.stateStore
          .listJobs()
          .filter((job) => job.routineName === "runtimeWakeup" && job.status === "pending"),
      ).toHaveLength(0);
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
