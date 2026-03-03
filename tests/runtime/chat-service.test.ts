import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UIMessage } from "ai";
import { z } from "zod";

import type { ActionDispatcher, ActionResult, LlmClient } from "../../apps/trenchclaw/src/ai";
import type { ActionContext, ActionStep } from "../../apps/trenchclaw/src/ai/runtime/types";
import { ActionRegistry, InMemoryRuntimeEventBus, InMemoryStateStore } from "../../apps/trenchclaw/src/ai";
import { createRuntimeChatService } from "../../apps/trenchclaw/src/runtime/chat";
import { SqliteStateStore } from "../../apps/trenchclaw/src/runtime/storage/sqlite-state-store";

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
const RUNTIME_DB_DIRECTORY = fileURLToPath(new URL("../../apps/trenchclaw/src/ai/brain/db", import.meta.url));
const createTestDbPath = (): string =>
  path.join(RUNTIME_DB_DIRECTORY, `trenchclaw-chat-runtime-${crypto.randomUUID()}.db`);

afterEach(() => {
  for (const dbPath of sqliteDbPaths.splice(0)) {
    void Bun.file(dbPath).delete().catch(() => {});
    void Bun.file(`${dbPath}-wal`).delete().catch(() => {});
    void Bun.file(`${dbPath}-shm`).delete().catch(() => {});
  }
});

describe("RuntimeChatService", () => {
  test("returns fallback text when llm is not configured", async () => {
    const registry = new ActionRegistry();
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

    const result = await service.generateText({ prompt: "hello" });
    expect(result.finishReason).toBe("llm-disabled");
    expect(result.text).toContain("LLM is not configured");
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

  test("dispatches tool calls through the backend dispatcher during streaming", async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "echo",
      category: "data-based",
      inputSchema: z.object({ value: z.number() }),
      execute: async () => makeActionResult({ ok: true }),
    });

    const dispatchCalls: Array<{ actor: string | undefined; actionName: string; input: unknown }> = [];
    let capturedSystemPrompt = "";
    const service = createRuntimeChatService(
      {
        dispatcher: {
          dispatchStep: async (_ctx: ActionContext, step: ActionStep) => {
            dispatchCalls.push({ actor: _ctx.actor, actionName: step.actionName, input: step.input });
            return {
              results: [makeActionResult({ ok: true, data: { echoed: step.input } })],
              policyHits: [],
            };
          },
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
    expect(dispatchCalls[0]).toEqual({ actor: "agent", actionName: "echo", input: { value: 42 } });
    expect(payload.ok).toBe(true);
    expect(payload.data.echoed).toEqual({ value: 42 });
    expect(capturedSystemPrompt).toContain("Filesystem policy");
  });

  test("preserves assistant role/history when preparing streaming messages", async () => {
    const registry = new ActionRegistry();
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
        parts: [{ type: "text", text: "calling tool now" }],
      },
    ]);

    expect(capturedMessages).toHaveLength(2);
    expect(capturedMessages[0]?.role).toBe("user");
    expect(capturedMessages[1]?.role).toBe("assistant");
    expect(capturedMessages[1]?.parts[0]).toEqual({ type: "text", text: "calling tool now" });
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
    expect(assistant?.content).toContain("Runtime error: User not found.");
  });
});
