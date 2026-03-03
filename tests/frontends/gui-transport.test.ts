import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import { InMemoryRuntimeEventBus, InMemoryStateStore } from "../../apps/trenchclaw/src/ai";
import type { RuntimeBootstrap } from "../../apps/trenchclaw/src/runtime/bootstrap";
import { RuntimeGuiTransport } from "../../apps/trenchclaw/src/runtime/gui-transport";

const buildRuntime = (input?: {
  streamImpl?: (
    messages: UIMessage[],
    options?: { headers?: HeadersInit; chatId?: string; sessionId?: string; conversationTitle?: string },
  ) => Promise<Response>;
}): RuntimeBootstrap => {
  const stateStore = new InMemoryStateStore();

  const streamImpl =
    input?.streamImpl ??
    (async () =>
      new Response("event: done\ndata: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }));

  return {
    llm: null,
    settings: { profile: "dangerous" },
    chat: {
      listToolNames: () => [],
      generateText: async () => ({ text: "ok", finishReason: "stop" }),
      stream: streamImpl,
    },
    eventBus: new InMemoryRuntimeEventBus(),
    stateStore,
    scheduler: { start: () => {}, stop: () => {} } as RuntimeBootstrap["scheduler"],
    dispatcher: {} as RuntimeBootstrap["dispatcher"],
    registry: { list: () => [] } as RuntimeBootstrap["registry"],
    session: null,
    stop: () => {},
    enqueueJob: () =>
      ({
        id: "job-1",
        botId: "bot-1",
        routineName: "noop",
        status: "pending",
        config: {},
        cyclesCompleted: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }) as ReturnType<RuntimeBootstrap["enqueueJob"]>,
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

    const runtime = buildRuntime({
      streamImpl: async (_messages, options) => {
        callCount += 1;
        capturedHeaders = options?.headers;
        capturedChatId = options?.chatId;
        return new Response("event: done\ndata: [DONE]\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    });
    const transport = new RuntimeGuiTransport(runtime);
    const handler = transport.createApiHandler();

    const response = await handler(
      new Request("http://localhost/v1/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
          chatId: "chat-v1-1",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(callCount).toBe(1);
    expect(capturedChatId).toBe("chat-v1-1");
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

  test("POST /v1/chat/turn returns the final assistant message", async () => {
    const runtime = buildRuntime({
      streamImpl: async (_messages, options) => {
        const chatId = options?.chatId ?? "chat-default";
        const now = Date.now();
        runtime.stateStore.saveConversation({
          id: chatId,
          createdAt: now,
          updatedAt: now,
        });
        runtime.stateStore.saveChatMessage({
          id: `msg-${chatId}-1`,
          conversationId: chatId,
          role: "user",
          content: "hello",
          createdAt: now,
        });
        runtime.stateStore.saveChatMessage({
          id: `msg-${chatId}-2`,
          conversationId: chatId,
          role: "assistant",
          content: "hi there",
          createdAt: now + 1,
        });
        return new Response("event: done\ndata: [DONE]\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    });

    const transport = new RuntimeGuiTransport(runtime);
    const handler = transport.createApiHandler();
    const response = await handler(
      new Request("http://localhost/v1/chat/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
          chatId: "chat-turn-1",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { chatId: string; message: UIMessage; messages: UIMessage[] };
    expect(payload.chatId).toBe("chat-turn-1");
    expect(payload.message.role).toBe("assistant");
    expect(payload.messages.length).toBeGreaterThan(0);
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
        && payloadText.includes("event: activity")
      ) {
        break;
      }
    }

    expect(payloadText).toContain("event: bootstrap");
    expect(payloadText).toContain("event: queue");
    expect(payloadText).toContain("event: activity");

    abortController.abort();
    await reader.cancel();
  });

  test("legacy /api chat route is available", async () => {
    const runtime = buildRuntime();
    const transport = new RuntimeGuiTransport(runtime);
    const handler = transport.createApiHandler();

    const response = await handler(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
          chatId: "legacy-chat-1",
        }),
      }),
    );
    expect(response.status).toBe(200);
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
});
