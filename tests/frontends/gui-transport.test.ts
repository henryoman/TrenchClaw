import { beforeAll, beforeEach, afterAll, describe, expect, test } from "bun:test";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { InMemoryRuntimeEventBus } from "../../apps/trenchclaw/src/ai";
import type { RuntimeBootstrap } from "../../apps/trenchclaw/src/runtime/bootstrap";
import { RuntimeGuiTransport } from "../../apps/frontends/cli/gui-transport";

const CORE_APP_ROOT = path.resolve("/Volumes/T9/cursor/TrenchClaw/apps/trenchclaw");
const VAULT_FILE_PATH = path.join(CORE_APP_ROOT, "src/ai/brain/protected/no-read/vault.json");
const INSTANCE_DIRECTORY = path.join(CORE_APP_ROOT, "src/ai/brain/protected/instance");

const readJson = async (filePath: string): Promise<Record<string, unknown>> => {
  const text = await readFile(filePath, "utf8");
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Expected JSON object in ${filePath}`);
  }
  return parsed as Record<string, unknown>;
};

const buildTransport = (): RuntimeGuiTransport => {
  const runtime = {
    llm: null,
    settings: { profile: "dangerous" },
    chat: {
      listToolNames: () => [],
      generateText: async () => ({ text: "ok", finishReason: "stop" }),
      stream: async () => new Response("ok"),
    },
    eventBus: {
      on: () => () => {},
    },
    stateStore: {
      listJobs: () => [],
      getJob: () => null,
      listConversations: () => [],
    },
    describe: () => ({
      profile: "dangerous",
      registeredActions: [],
      pendingJobs: 0,
      schedulerTickMs: 1000,
      llmEnabled: false,
    }),
  } as unknown as RuntimeBootstrap;

  return new RuntimeGuiTransport(runtime);
};

describe("RuntimeGuiTransport", () => {
  let originalVaultExists = false;
  let originalVaultText = "";
  let originalInstanceFileNames = new Set<string>();

  const restoreVault = async (): Promise<void> => {
    await mkdir(path.dirname(VAULT_FILE_PATH), { recursive: true, mode: 0o700 });
    if (originalVaultExists) {
      await writeFile(VAULT_FILE_PATH, originalVaultText, { encoding: "utf8", mode: 0o600 });
      return;
    }
    await rm(VAULT_FILE_PATH, { force: true });
  };

  const listInstanceFileNames = async (): Promise<string[]> => {
    await mkdir(INSTANCE_DIRECTORY, { recursive: true, mode: 0o700 });
    const entries = await readdir(INSTANCE_DIRECTORY, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /^user-\d+\.json$/u.test(entry.name))
      .map((entry) => entry.name);
  };

  const cleanupCreatedInstanceFiles = async (): Promise<void> => {
    const currentFiles = await listInstanceFileNames();
    const filesToRemove = currentFiles.filter((fileName) => !originalInstanceFileNames.has(fileName));
    await Promise.all(filesToRemove.map((fileName) => rm(path.join(INSTANCE_DIRECTORY, fileName), { force: true })));
  };

  beforeAll(async () => {
    try {
      originalVaultText = await readFile(VAULT_FILE_PATH, "utf8");
      originalVaultExists = true;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
      originalVaultExists = false;
    }
    originalInstanceFileNames = new Set(await listInstanceFileNames());
  });

  beforeEach(async () => {
    await restoreVault();
    await cleanupCreatedInstanceFiles();
  });

  afterAll(async () => {
    await restoreVault();
    await cleanupCreatedInstanceFiles();
  });

  test("streamChat delegates to runtime.chat.stream with CORS headers", async () => {
    let streamCallCount = 0;
    let capturedHeaders: HeadersInit | undefined;
    let capturedChatId: string | undefined;
    let capturedSessionId: string | undefined;

    const runtime = {
      llm: null,
      settings: { profile: "dangerous" },
      chat: {
        listToolNames: () => [],
        generateText: async () => ({ text: "ok", finishReason: "stop" }),
        stream: async (
          _messages: unknown[],
          input?: { headers?: HeadersInit; chatId?: string; sessionId?: string; conversationTitle?: string },
        ) => {
          streamCallCount += 1;
          capturedHeaders = input?.headers;
          capturedChatId = input?.chatId;
          capturedSessionId = input?.sessionId;
          return new Response("ok", { status: 200, headers: { "x-test-stream": "1" } });
        },
      },
      eventBus: {
        on: () => () => {},
      },
      stateStore: {
        listJobs: () => [],
      },
      describe: () => ({
        profile: "dangerous",
        registeredActions: [],
        pendingJobs: 0,
        schedulerTickMs: 1000,
        llmEnabled: false,
      }),
    } as unknown as RuntimeBootstrap;

    const transport = new RuntimeGuiTransport(runtime);
    const response = await transport.streamChat([], { chatId: "chat-test-1" });

    expect(streamCallCount).toBe(1);
    const headers = new Headers(capturedHeaders);
    expect(headers.get("access-control-allow-origin")).toBe("*");
    expect(headers.get("access-control-allow-methods")).toBe("GET,POST,PUT,DELETE,OPTIONS");
    expect(capturedChatId).toBe("chat-test-1");
    expect(capturedSessionId).toBeUndefined();
    expect(response.headers.get("x-test-stream")).toBe("1");
  });

  test("legacy /api/gui/chat endpoint is removed", async () => {
    const runtime = {
      llm: null,
      settings: { profile: "dangerous" },
      chat: {
        listToolNames: () => [],
        generateText: async () => ({ text: "ok", finishReason: "stop" }),
        stream: async () => new Response("ok"),
      },
      eventBus: {
        on: () => () => {},
      },
      stateStore: {
        listJobs: () => [],
      },
      describe: () => ({
        profile: "dangerous",
        registeredActions: [],
        pendingJobs: 0,
        schedulerTickMs: 1000,
        llmEnabled: false,
      }),
    } as unknown as RuntimeBootstrap;

    const transport = new RuntimeGuiTransport(runtime);
    const handler = transport.createApiHandler();
    const response = await handler(
      new Request("http://localhost/api/gui/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      }),
    );
    expect(response.status).toBe(404);
  });

  test("dispatcher test endpoint enqueues queue work and returns action output", async () => {
    const jobs = new Map<string, { id: string; status: string; lastResult?: { data?: unknown } }>();

    const runtime = {
      llm: null,
      settings: { profile: "dangerous" },
      chat: {
        listToolNames: () => [],
        generateText: async () => ({ text: "ok", finishReason: "stop" }),
        stream: async () => new Response("ok"),
      },
      enqueueJob: (input: { botId: string; routineName: string; config: { steps: Array<{ input: { message: string } }> } }) => {
        const id = "job-test-1";
        jobs.set(id, {
          id,
          status: "pending",
          lastResult: {
            data: {
              message: input.config.steps[0]?.input.message ?? "",
              actor: "system",
            },
          },
        });
        return {
          id,
          botId: input.botId,
          routineName: input.routineName,
          status: "pending",
          config: input.config,
          cyclesCompleted: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          nextRunAt: Date.now(),
        };
      },
      eventBus: {
        on: () => () => {},
      },
      stateStore: {
        listJobs: () => [],
        getJob: (id: string) => jobs.get(id) ?? null,
      },
      describe: () => ({
        profile: "dangerous",
        registeredActions: [],
        pendingJobs: 0,
        schedulerTickMs: 1000,
        llmEnabled: false,
      }),
    } as unknown as RuntimeBootstrap;

    const transport = new RuntimeGuiTransport(runtime);
    const handler = transport.createApiHandler();
    const response = await handler(
      new Request("http://localhost/api/gui/tests/dispatcher", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "queue-model-test", waitMs: 1 }),
      }),
    );

    const payload = (await response.json()) as {
      completed: boolean;
      status: string;
      result: { message: string };
    };
    expect(response.status).toBe(200);
    expect(payload.completed).toBe(true);
    expect(payload.status).toBe("pending");
    expect(payload.result.message).toBe("queue-model-test");
  });

  test("create instance persists safety profile and PIN requirement", async () => {
    const transport = buildTransport();
    const handler = transport.createApiHandler();

    const createResponse = await handler(
      new Request("http://localhost/api/gui/instances", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Ops Vault",
          safetyProfile: "safe",
          userPin: "2468",
        }),
      }),
    );

    expect(createResponse.status).toBe(200);
    const createPayload = (await createResponse.json()) as {
      instance: { localInstanceId: string; name: string; safetyProfile: string; userPinRequired: boolean };
    };
    expect(createPayload.instance.name).toBe("Ops Vault");
    expect(createPayload.instance.safetyProfile).toBe("safe");
    expect(createPayload.instance.userPinRequired).toBe(true);

    const listResponse = await handler(new Request("http://localhost/api/gui/instances", { method: "GET" }));
    expect(listResponse.status).toBe(200);
    const listPayload = (await listResponse.json()) as {
      instances: Array<{ localInstanceId: string; safetyProfile: string; userPinRequired: boolean }>;
    };
    const created = listPayload.instances.find((instance) => instance.localInstanceId === createPayload.instance.localInstanceId);
    expect(created).toBeDefined();
    expect(created?.safetyProfile).toBe("safe");
    expect(created?.userPinRequired).toBe(true);
  });

  test("sign in endpoint accepts valid PIN and rejects invalid PIN", async () => {
    const transport = buildTransport();
    const handler = transport.createApiHandler();

    const createResponse = await handler(
      new Request("http://localhost/api/gui/instances", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "PIN Desk",
          safetyProfile: "dangerous",
          userPin: "1357",
        }),
      }),
    );
    expect(createResponse.status).toBe(200);
    const createPayload = (await createResponse.json()) as { instance: { localInstanceId: string } };

    const invalidSignInResponse = await handler(
      new Request("http://localhost/api/gui/instances/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          localInstanceId: createPayload.instance.localInstanceId,
          userPin: "0000",
        }),
      }),
    );
    expect(invalidSignInResponse.status).toBe(401);
    const invalidPayload = (await invalidSignInResponse.json()) as { error: string };
    expect(invalidPayload.error).toContain("Invalid PIN");

    const validSignInResponse = await handler(
      new Request("http://localhost/api/gui/instances/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          localInstanceId: createPayload.instance.localInstanceId,
          userPin: "1357",
        }),
      }),
    );
    expect(validSignInResponse.status).toBe(200);
    const validPayload = (await validSignInResponse.json()) as {
      instance: { localInstanceId: string; userPinRequired: boolean };
    };
    expect(validPayload.instance.localInstanceId).toBe(createPayload.instance.localInstanceId);
    expect(validPayload.instance.userPinRequired).toBe(true);
  });

  test("chat-triggered model flow surfaces queue + activity log updates", async () => {
    const eventBus = new InMemoryRuntimeEventBus();
    const jobs: Array<{
      id: string;
      botId: string;
      routineName: string;
      status: "pending" | "running" | "paused" | "failed" | "stopped";
      createdAt: number;
      updatedAt: number;
      nextRunAt: number;
      cyclesCompleted: number;
    }> = [];

    const runtime = {
      llm: null,
      settings: { profile: "dangerous" },
      chat: {
        listToolNames: () => ["pingRuntime"],
        generateText: async () => ({ text: "ok", finishReason: "stop" }),
        stream: async () => {
          const now = Date.now();
          jobs.splice(0, jobs.length, {
            id: "job-model-1",
            botId: "chat-bot",
            routineName: "model-dispatch",
            status: "running",
            createdAt: now,
            updatedAt: now,
            nextRunAt: now,
            cyclesCompleted: 0,
          });

          eventBus.emit("queue:enqueue", {
            jobId: "job-model-1",
            botId: "chat-bot",
            routineName: "model-dispatch",
            queueSize: 1,
            queuePosition: 1,
          });
          eventBus.emit("queue:dequeue", {
            jobId: "job-model-1",
            botId: "chat-bot",
            routineName: "model-dispatch",
            queueSize: 1,
            queuePosition: 1,
            waitMs: 5,
          });
          eventBus.emit("queue:complete", {
            jobId: "job-model-1",
            botId: "chat-bot",
            routineName: "model-dispatch",
            status: "pending",
            durationMs: 6,
            cyclesCompleted: 1,
          });
          return new Response("ok", { status: 200 });
        },
      },
      eventBus,
      stateStore: {
        listJobs: () => jobs,
        listConversations: () => [],
      },
      describe: () => ({
        profile: "dangerous",
        registeredActions: [],
        pendingJobs: jobs.length,
        schedulerTickMs: 1000,
        llmEnabled: false,
      }),
    } as unknown as RuntimeBootstrap;

    const transport = new RuntimeGuiTransport(runtime);
    const handler = transport.createApiHandler();

    const chatResponse = await handler(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chatId: "chat-model-queue-1",
          messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "please ping the server" }] }],
        }),
      }),
    );
    expect(chatResponse.status).toBe(200);
    await Bun.sleep(0);

    const queueResponse = await handler(new Request("http://localhost/api/gui/queue", { method: "GET" }));
    const queuePayload = (await queueResponse.json()) as {
      jobs: Array<{ id: string; botId: string; routineName: string; status: string }>;
    };
    expect(queuePayload.jobs.length).toBe(1);
    expect(queuePayload.jobs[0]).toMatchObject({
      id: "job-model-1",
      botId: "chat-bot",
      routineName: "model-dispatch",
      status: "running",
    });

    const activityResponse = await handler(new Request("http://localhost/api/gui/activity?limit=20", { method: "GET" }));
    const activityPayload = (await activityResponse.json()) as {
      entries: Array<{ source: string; summary: string }>;
    };
    expect(activityPayload.entries.some((entry) => entry.source === "chat" && entry.summary.includes("Streaming prompt"))).toBe(
      true,
    );
    expect(
      activityPayload.entries.some((entry) => entry.source === "queue" && entry.summary.includes("Queued model-dispatch")),
    ).toBe(true);
    expect(
      activityPayload.entries.some((entry) => entry.source === "queue" && entry.summary.includes("Started model-dispatch")),
    ).toBe(true);
    expect(
      activityPayload.entries.some((entry) => entry.source === "queue" && entry.summary.includes("Confirmed model-dispatch")),
    ).toBe(true);
  });

  test("secrets endpoint persists trimmed custom key to vault.json", async () => {
    const transport = buildTransport();
    const handler = transport.createApiHandler();

    const saveResponse = await handler(
      new Request("http://localhost/api/gui/secrets", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          optionId: "openrouter-api-key",
          value: "  sk-openrouter-test  ",
          source: "custom",
        }),
      }),
    );

    expect(saveResponse.status).toBe(200);
    const vaultJson = await readJson(VAULT_FILE_PATH);
    expect((vaultJson.llm as Record<string, unknown>).openrouter).toBeDefined();
    expect(((vaultJson.llm as Record<string, unknown>).openrouter as Record<string, unknown>)["api-key"]).toBe(
      "sk-openrouter-test",
    );

    const readResponse = await handler(new Request("http://localhost/api/gui/secrets", { method: "GET" }));
    const payload = (await readResponse.json()) as { entries: Array<{ optionId: string; value: string }> };
    const openrouterEntry = payload.entries.find((entry) => entry.optionId === "openrouter-api-key");
    expect(openrouterEntry?.value).toBe("sk-openrouter-test");
  });

  test("secrets endpoint persists public RPC selection and returns metadata", async () => {
    const transport = buildTransport();
    const handler = transport.createApiHandler();

    const saveResponse = await handler(
      new Request("http://localhost/api/gui/secrets", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          optionId: "solana-rpc-url",
          value: "ignored",
          source: "public",
          publicRpcId: "solana-devnet",
        }),
      }),
    );
    expect(saveResponse.status).toBe(200);

    const vaultJson = await readJson(VAULT_FILE_PATH);
    const rpcDefault = ((vaultJson.rpc as Record<string, unknown>).default as Record<string, unknown>) ?? {};
    expect(rpcDefault["source"]).toBe("public");
    expect(rpcDefault["public-id"]).toBe("solana-devnet");
    expect(rpcDefault["http-url"]).toBe("https://api.devnet.solana.com");

    const readResponse = await handler(new Request("http://localhost/api/gui/secrets", { method: "GET" }));
    const payload = (await readResponse.json()) as {
      entries: Array<{
        optionId: string;
        value: string;
        source: "custom" | "public";
        publicRpcId: string | null;
      }>;
    };
    const rpcEntry = payload.entries.find((entry) => entry.optionId === "solana-rpc-url");
    expect(rpcEntry?.value).toBe("https://api.devnet.solana.com");
    expect(rpcEntry?.source).toBe("public");
    expect(rpcEntry?.publicRpcId).toBe("solana-devnet");
  });

  test("delete secret clears value and resets RPC source metadata", async () => {
    const transport = buildTransport();
    const handler = transport.createApiHandler();

    await handler(
      new Request("http://localhost/api/gui/secrets", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          optionId: "solana-rpc-url",
          value: "https://custom-rpc.local",
          source: "custom",
          publicRpcId: null,
        }),
      }),
    );

    const clearResponse = await handler(
      new Request("http://localhost/api/gui/secrets", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionId: "solana-rpc-url" }),
      }),
    );
    expect(clearResponse.status).toBe(200);

    const vaultJson = await readJson(VAULT_FILE_PATH);
    const rpcDefault = ((vaultJson.rpc as Record<string, unknown>).default as Record<string, unknown>) ?? {};
    expect(rpcDefault["http-url"]).toBe("");
    expect(rpcDefault["source"]).toBe("custom");
    expect(rpcDefault["public-id"]).toBe("");
  });

  test("invalid public RPC option returns 400 and does not persist changes", async () => {
    const transport = buildTransport();
    const handler = transport.createApiHandler();

    await handler(
      new Request("http://localhost/api/gui/secrets", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          optionId: "solana-rpc-url",
          value: "https://custom-before-invalid.local",
          source: "custom",
        }),
      }),
    );

    const invalidResponse = await handler(
      new Request("http://localhost/api/gui/secrets", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          optionId: "solana-rpc-url",
          value: "ignored",
          source: "public",
          publicRpcId: "not-a-real-public-rpc",
        }),
      }),
    );
    expect(invalidResponse.status).toBe(400);
    const errorPayload = (await invalidResponse.json()) as { error: string };
    expect(errorPayload.error).toContain("publicRpcId");

    const vaultJson = await readJson(VAULT_FILE_PATH);
    const rpcDefault = ((vaultJson.rpc as Record<string, unknown>).default as Record<string, unknown>) ?? {};
    expect(rpcDefault["source"]).toBe("custom");
    expect(rpcDefault["http-url"]).toBe("https://custom-before-invalid.local");
    expect(rpcDefault["public-id"]).toBe("");
  });
});
