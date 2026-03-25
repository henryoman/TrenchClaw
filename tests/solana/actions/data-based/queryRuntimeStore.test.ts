import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/contracts/types/context";
import { SqliteStateStore } from "../../../../apps/trenchclaw/src/runtime/storage/sqlite-state-store";
import { queryRuntimeStoreAction } from "../../../../apps/trenchclaw/src/tools/core/queryRuntimeStore";
import { runtimeStatePath } from "../../../helpers/core-paths";

const dbPaths: string[] = [];
const RUNTIME_DB_DIRECTORY = runtimeStatePath("instances/01/data/.tests");
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

  test("returns a cursorable older-message history slice for a conversation", async () => {
    const dbPath = createTestDbPath();
    dbPaths.push(dbPath);

    const store = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });
    const now = Date.now();
    store.saveConversation({
      id: "conv-history-1",
      sessionId: "session-history-1",
      title: "History",
      createdAt: now,
      updatedAt: now,
    });
    store.saveChatMessage({
      id: "msg-history-1",
      conversationId: "conv-history-1",
      role: "user",
      content: "one",
      createdAt: now,
    });
    store.saveChatMessage({
      id: "msg-history-2",
      conversationId: "conv-history-1",
      role: "assistant",
      content: "two",
      createdAt: now + 1,
    });
    store.saveChatMessage({
      id: "msg-history-3",
      conversationId: "conv-history-1",
      role: "user",
      content: "three",
      createdAt: now + 2,
    });
    store.saveChatMessage({
      id: "msg-history-4",
      conversationId: "conv-history-1",
      role: "assistant",
      content: "four",
      createdAt: now + 3,
    });

    const ctx = createActionContext({ actor: "agent", stateStore: store });
    const result = await queryRuntimeStoreAction.execute(ctx, {
      request: {
        type: "getConversationHistorySlice",
        conversationId: "conv-history-1",
        beforeMessageId: "msg-history-4",
        limit: 2,
        tokenBudget: 500,
      },
    });

    expect(result.ok).toBe(true);
    const payload = result.data as {
      requestType: string;
      result: {
        conversationId: string;
        messages: Array<{ id: string; content: string }>;
        hasMoreBefore: boolean;
        nextBeforeMessageId?: string;
        oldestReturnedMessageId?: string;
        newestReturnedMessageId?: string;
      };
    };
    expect(payload.requestType).toBe("getConversationHistorySlice");
    expect(payload.result.conversationId).toBe("conv-history-1");
    expect(payload.result.messages.map((message) => message.id)).toEqual(["msg-history-2", "msg-history-3"]);
    expect(payload.result.hasMoreBefore).toBe(true);
    expect(payload.result.nextBeforeMessageId).toBe("msg-history-2");
    expect(payload.result.oldestReturnedMessageId).toBe("msg-history-2");
    expect(payload.result.newestReturnedMessageId).toBe("msg-history-3");

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

  test("returns a queued job by serial number", async () => {
    const dbPath = createTestDbPath();
    dbPaths.push(dbPath);

    const store = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });
    const now = Date.now();
    store.saveJob({
      id: "job-wallet-scan-1",
      serialNumber: 42,
      botId: "wallet-contents:test",
      routineName: "walletInventoryScan",
      status: "running",
      config: {
        requestKey: "wallet-contents:test",
      },
      cyclesCompleted: 0,
      createdAt: now,
      updatedAt: now,
    });

    const ctx = createActionContext({ actor: "agent", stateStore: store });
    const result = await queryRuntimeStoreAction.execute(ctx, {
      request: {
        type: "getJobBySerial",
        serialNumber: 42,
      },
    });

    expect(result.ok).toBe(true);
    const payload = result.data as {
      requestType: string;
      result: { id: string; routineName: string; status: string };
    };
    expect(payload.requestType).toBe("getJobBySerial");
    expect(payload.result.id).toBe("job-wallet-scan-1");
    expect(payload.result.routineName).toBe("walletInventoryScan");
    expect(payload.result.status).toBe("running");

    store.close();
  });

  test("returns the upcoming trading schedule through a dedicated request type", async () => {
    const dbPath = createTestDbPath();
    dbPaths.push(dbPath);

    const store = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });
    const now = Date.now();
    store.saveJob({
      id: "job-trading-1",
      serialNumber: 7,
      botId: "trading-routine:future-1",
      routineName: "actionSequence",
      status: "pending",
      config: {
        type: "tradingRoutine",
        kind: "swap_once",
        swapProvider: "ultra",
        steps: [
          {
            key: "swap-1",
            actionName: "managedSwap",
            input: {
              inputCoin: "SOL",
              outputCoin: "USDC",
              amount: "0.1",
            },
          },
        ],
      },
      nextRunAt: now + 60_000,
      cyclesCompleted: 0,
      createdAt: now,
      updatedAt: now,
    });
    store.saveJob({
      id: "job-trading-2",
      serialNumber: 8,
      botId: "trading-routine:future-2",
      routineName: "actionSequence",
      status: "paused",
      config: {
        type: "tradingRoutineSlice",
        kind: "dca",
        executionMode: "staggered_jobs",
        swapProvider: "ultra",
        steps: [
          {
            key: "swap-2",
            actionName: "managedSwap",
            input: {
              inputCoin: "USDC",
              outputCoin: "SOL",
              amount: "100%",
            },
          },
        ],
      },
      nextRunAt: now + 120_000,
      cyclesCompleted: 0,
      createdAt: now,
      updatedAt: now,
    });
    store.saveJob({
      id: "job-non-trading-1",
      serialNumber: 9,
      botId: "ops",
      routineName: "actionSequence",
      status: "pending",
      config: {
        steps: [
          {
            key: "ping-1",
            actionName: "pingRuntime",
            input: {
              message: "hello",
            },
          },
        ],
      },
      nextRunAt: now + 30_000,
      cyclesCompleted: 0,
      createdAt: now,
      updatedAt: now,
    });

    const ctx = createActionContext({ actor: "agent", stateStore: store });
    const result = await queryRuntimeStoreAction.execute(ctx, {
      request: {
        type: "listUpcomingTradingJobs",
        limit: 10,
        nowUnixMs: now,
      },
    });

    expect(result.ok).toBe(true);
    const payload = result.data as {
      requestType: string;
      result: Array<{
        id: string;
        serialNumber: number | null;
        kind: string | null;
        executionMode: string | null;
        swapProvider: string | null;
        summary: string | null;
      }>;
    };
    expect(payload.requestType).toBe("listUpcomingTradingJobs");
    expect(payload.result).toHaveLength(2);
    expect(payload.result[0]).toMatchObject({
      id: "job-trading-1",
      serialNumber: 7,
      kind: "swap_once",
      swapProvider: "ultra",
      summary: "managedSwap | SOL -> USDC | amount=0.1",
    });
    expect(payload.result[1]).toMatchObject({
      id: "job-trading-2",
      serialNumber: 8,
      kind: "dca",
      executionMode: "staggered_jobs",
      swapProvider: "ultra",
      summary: "managedSwap | USDC -> SOL | amount=100%",
    });

    store.close();
  });

  test("accepts stringified request payloads produced by model tool calls", () => {
    const parsed = queryRuntimeStoreAction.inputSchema!.parse({
      request: "{\"type\":\"getRuntimeKnowledgeSurface\",\"recentConversationsLimit\":20,\"recentJobsLimit\":20,\"recentReceiptsLimit\":20}",
    });

    expect(parsed.request.type).toBe("getRuntimeKnowledgeSurface");
    if (parsed.request.type === "getRuntimeKnowledgeSurface") {
      expect(parsed.request.recentConversationsLimit).toBe(20);
      expect(parsed.request.recentJobsLimit).toBe(20);
      expect(parsed.request.recentReceiptsLimit).toBe(20);
    }
  });

  test("accepts stringified upcoming-trading request payloads", () => {
    const parsed = queryRuntimeStoreAction.inputSchema!.parse({
      request: "{\"type\":\"listUpcomingTradingJobs\",\"limit\":5}",
    });

    expect(parsed.request.type).toBe("listUpcomingTradingJobs");
    if (parsed.request.type === "listUpcomingTradingJobs") {
      expect(parsed.request.limit).toBe(5);
    }
  });

  test("accepts stringified conversation-history-slice request payloads", () => {
    const parsed = queryRuntimeStoreAction.inputSchema!.parse({
      request: "{\"type\":\"getConversationHistorySlice\",\"conversationId\":\"conv-1\",\"beforeMessageId\":\"msg-9\",\"limit\":10,\"tokenBudget\":1500}",
    });

    expect(parsed.request.type).toBe("getConversationHistorySlice");
    if (parsed.request.type === "getConversationHistorySlice") {
      expect(parsed.request.conversationId).toBe("conv-1");
      expect(parsed.request.beforeMessageId).toBe("msg-9");
      expect(parsed.request.limit).toBe(10);
      expect(parsed.request.tokenBudget).toBe(1500);
    }
  });
});
