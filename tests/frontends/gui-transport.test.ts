import { describe, expect, test } from "bun:test";

import type { RuntimeBootstrap } from "../../apps/trenchclaw/src/runtime/bootstrap";
import { RuntimeGuiTransport } from "../../apps/frontends/cli/gui-transport";

describe("RuntimeGuiTransport", () => {
  test("sendChat delegates to runtime.chat.generateText and persists messages", async () => {
    const messages: Array<{ role: string; content: string }> = [];
    const conversations = new Map<string, { id: string; createdAt: number; updatedAt: number }>();
    let generatedPrompt = "";

    const runtime = {
      settings: { profile: "dangerous" },
      llm: null,
      chat: {
        listToolNames: () => [],
        generateText: async (input: { prompt: string }) => {
          generatedPrompt = input.prompt;
          return { text: "assistant reply", finishReason: "stop" };
        },
        stream: async () => new Response("stream"),
      },
      eventBus: {
        on: () => () => {},
      },
      stateStore: {
        getConversation: (id: string) => conversations.get(id) ?? null,
        saveConversation: (conversation: { id: string; createdAt: number; updatedAt: number }) => {
          conversations.set(conversation.id, conversation);
        },
        saveChatMessage: (message: { role: string; content: string }) => {
          messages.push({ role: message.role, content: message.content });
        },
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
    const result = await transport.sendChat("hello runtime");

    expect(generatedPrompt).toBe("hello runtime");
    expect(result.reply).toBe("assistant reply");
    expect(result.llmEnabled).toBe(false);
    expect(messages.map((entry) => entry.role)).toEqual(["user", "assistant"]);
    expect(messages.map((entry) => entry.content)).toEqual(["hello runtime", "assistant reply"]);
  });

  test("streamChat delegates to runtime.chat.stream with CORS headers", async () => {
    let streamCallCount = 0;
    let capturedHeaders: HeadersInit | undefined;

    const runtime = {
      llm: null,
      settings: { profile: "dangerous" },
      chat: {
        listToolNames: () => [],
        generateText: async () => ({ text: "ok", finishReason: "stop" }),
        stream: async (_messages: unknown[], input?: { headers?: HeadersInit }) => {
          streamCallCount += 1;
          capturedHeaders = input?.headers;
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
    const response = await transport.streamChat([]);

    expect(streamCallCount).toBe(1);
    const headers = new Headers(capturedHeaders);
    expect(headers.get("access-control-allow-origin")).toBe("*");
    expect(headers.get("access-control-allow-methods")).toBe("GET,POST,OPTIONS");
    expect(response.headers.get("x-test-stream")).toBe("1");
  });
});
