import { describe, expect, test } from "bun:test";

import type { RuntimeBootstrap } from "../../apps/trenchclaw/src/runtime/bootstrap";
import { RuntimeGuiTransport } from "../../apps/frontends/cli/gui-transport";

describe("RuntimeGuiTransport", () => {
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
    expect(headers.get("access-control-allow-methods")).toBe("GET,POST,OPTIONS");
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
});
