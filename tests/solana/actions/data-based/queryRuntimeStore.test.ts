import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/runtime/types/context";
import { SqliteStateStore } from "../../../../apps/trenchclaw/src/runtime/storage/sqlite-state-store";
import { queryRuntimeStoreAction } from "../../../../apps/trenchclaw/src/solana/actions/data-fetch/runtime/queryRuntimeStore";

const dbPaths: string[] = [];
const RUNTIME_DB_DIRECTORY = fileURLToPath(new URL("../../../../apps/trenchclaw/src/ai/brain/db", import.meta.url));
const createTestDbPath = (): string =>
  path.join(RUNTIME_DB_DIRECTORY, `trenchclaw-query-runtime-${crypto.randomUUID()}.db`);

afterEach(() => {
  for (const dbPath of dbPaths.splice(0)) {
    const file = Bun.file(dbPath);
    void file.delete().catch(() => {});
    void Bun.file(`${dbPath}-wal`).delete().catch(() => {});
    void Bun.file(`${dbPath}-shm`).delete().catch(() => {});
  }
});

describe("queryRuntimeStoreAction", () => {
  test("returns conversation and chat data through JSON request input", async () => {
    const dbPath = createTestDbPath();
    dbPaths.push(dbPath);

    const store = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });
    const now = Date.now();
    store.saveConversation({
      id: "conv-1",
      sessionId: "session-1",
      title: "Main",
      summary: "Quick summary",
      createdAt: now,
      updatedAt: now,
    });
    store.saveChatMessage({
      id: "msg-1",
      conversationId: "conv-1",
      role: "user",
      content: "hello",
      createdAt: now,
    });

    const ctx = createActionContext({ actor: "agent", stateStore: store });
    const result = await queryRuntimeStoreAction.execute(ctx, {
      request: {
        type: "listChatMessages",
        conversationId: "conv-1",
        limit: 20,
      },
    });

    expect(result.ok).toBe(true);
    const payload = result.data as { requestType: string; result: Array<{ content: string }> };
    expect(payload.requestType).toBe("listChatMessages");
    expect(payload.result[0]?.content).toBe("hello");

    store.close();
  });

  test("fails clearly when stateStore is missing from action context", async () => {
    const result = await queryRuntimeStoreAction.execute(createActionContext({ actor: "agent" }), {
      request: {
        type: "listConversations",
        limit: 10,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("STATE_STORE_UNAVAILABLE");
  });

  test("supports multi-surface text search for conversations/messages/jobs/receipts", async () => {
    const dbPath = createTestDbPath();
    dbPaths.push(dbPath);

    const store = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });

    const now = Date.now();
    store.saveConversation({
      id: "conv-search-1",
      sessionId: "session-search-1",
      title: "Alpha Plan",
      summary: "Track banana signals",
      createdAt: now,
      updatedAt: now,
    });
    store.saveChatMessage({
      id: "msg-search-1",
      conversationId: "conv-search-1",
      role: "assistant",
      content: "banana breakout detected",
      createdAt: now,
    });
    store.saveJob({
      id: "job-search-1",
      botId: "banana-bot",
      routineName: "actionSequence",
      status: "pending",
      config: {},
      cyclesCompleted: 0,
      createdAt: now,
      updatedAt: now,
    });
    store.saveReceipt({
      ok: true,
      retryable: false,
      idempotencyKey: "receipt-search-1",
      timestamp: now,
      durationMs: 1,
      data: {
        note: "banana receipt",
      },
    });

    const ctx = createActionContext({ actor: "agent", stateStore: store });
    const result = await queryRuntimeStoreAction.execute(ctx, {
      request: {
        type: "searchRuntimeText",
        query: "banana",
        scope: "all",
        limit: 10,
        messageScanLimit: 100,
      },
    });

    expect(result.ok).toBe(true);
    const payload = result.data as {
      requestType: string;
      result: {
        totalMatches: number;
        conversations: Array<{ id: string }>;
        messages: Array<{ id: string }>;
        jobs: Array<{ id: string }>;
        receipts: Array<{ idempotencyKey: string }>;
      };
    };
    expect(payload.requestType).toBe("searchRuntimeText");
    expect(payload.result.totalMatches).toBeGreaterThan(0);
    expect(payload.result.conversations.some((entry) => entry.id === "conv-search-1")).toBe(true);
    expect(payload.result.messages.some((entry) => entry.id === "msg-search-1")).toBe(true);
    expect(payload.result.jobs.some((entry) => entry.id === "job-search-1")).toBe(true);
    expect(payload.result.receipts.some((entry) => entry.idempotencyKey === "receipt-search-1")).toBe(true);

    store.close();
  });

  test("returns runtime knowledge surface summary", async () => {
    const dbPath = createTestDbPath();
    dbPaths.push(dbPath);

    const store = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });
    const now = Date.now();
    store.saveConversation({
      id: "conv-surface-1",
      sessionId: "session-surface-1",
      title: "Surface",
      summary: "summary",
      createdAt: now,
      updatedAt: now,
    });
    store.saveChatMessage({
      id: "msg-surface-1",
      conversationId: "conv-surface-1",
      role: "user",
      content: "surface hello",
      createdAt: now,
    });

    const ctx = createActionContext({ actor: "agent", stateStore: store });
    const result = await queryRuntimeStoreAction.execute(ctx, {
      request: {
        type: "getRuntimeKnowledgeSurface",
        recentConversationsLimit: 5,
        recentJobsLimit: 5,
        recentReceiptsLimit: 5,
      },
    });

    expect(result.ok).toBe(true);
    const payload = result.data as {
      requestType: string;
      result: {
        schemaSnapshot?: string;
        counts: { conversations: number; messages: number };
      };
    };
    expect(payload.requestType).toBe("getRuntimeKnowledgeSurface");
    expect(payload.result.counts.conversations).toBeGreaterThanOrEqual(1);
    expect(payload.result.counts.messages).toBeGreaterThanOrEqual(1);
    expect(payload.result.schemaSnapshot?.includes("chat_messages")).toBe(true);

    store.close();
  });
});
