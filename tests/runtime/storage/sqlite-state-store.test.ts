import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import type { ActionResult } from "../../../apps/trenchclaw/src/ai/runtime/types/action";
import { sqliteTables } from "../../../apps/trenchclaw/src/runtime/storage/sqlite-schema";
import { SqliteStateStore } from "../../../apps/trenchclaw/src/runtime/storage/sqlite-state-store";

const dbPaths: string[] = [];

afterEach(() => {
  for (const dbPath of dbPaths.splice(0)) {
    const file = Bun.file(dbPath);
    void file.delete();
    void Bun.file(`${dbPath}-wal`).delete();
    void Bun.file(`${dbPath}-shm`).delete();
  }
});

describe("SqliteStateStore", () => {
  test("persists jobs and receipts", () => {
    const dbPath = `/tmp/trenchclaw-store-${crypto.randomUUID()}.db`;
    dbPaths.push(dbPath);

    const store = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });

    const now = Date.now();
    store.saveJob({
      id: "job-1",
      botId: "bot-1",
      routineName: "createWallets",
      status: "pending",
      config: { count: 1 },
      cyclesCompleted: 0,
      createdAt: now,
      updatedAt: now,
    });

    const receipt: ActionResult = {
      ok: true,
      retryable: false,
      idempotencyKey: "idem-1",
      durationMs: 5,
      timestamp: now,
    };
    store.saveReceipt(receipt);

    expect(store.getJob("job-1")?.routineName).toBe("createWallets");
    expect(store.getReceipt("idem-1")?.ok).toBe(true);
    expect(store.getRecentReceipts(10).length).toBe(1);

    const prune = store.pruneRuntimeData({
      receiptsDays: 1,
      policyHitsDays: 1,
      decisionLogsDays: 1,
    });
    expect(prune.receiptsDeleted).toBe(0);

    store.close();
  });

  test("stores and reads OHLCV chart bars", () => {
    const dbPath = `/tmp/trenchclaw-market-${crypto.randomUUID()}.db`;
    dbPaths.push(dbPath);

    const store = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });

    const baseTime = 1_770_000_000_000;
    const writes = store.saveOhlcvBars({
      instrument: {
        chain: "solana",
        address: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
      },
      source: "dexscreener",
      interval: "1m",
      bars: [
        {
          openTime: baseTime,
          closeTime: baseTime + 59_999,
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1234.56,
          trades: 120,
          raw: { pair: "SOL/USDC" },
        },
      ],
    });

    expect(writes).toBe(1);

    const bars = store.getOhlcvBars({
      instrument: {
        chain: "solana",
        address: "So11111111111111111111111111111111111111112",
      },
      source: "dexscreener",
      interval: "1m",
      limit: 10,
    });

    expect(bars.length).toBe(1);
    expect(bars[0]?.close).toBe(100.5);
    expect((bars[0]?.raw as { pair?: string } | undefined)?.pair).toBe("SOL/USDC");

    store.close();
  });

  test("stores and reads conversations and chat messages", () => {
    const dbPath = `/tmp/trenchclaw-chat-${crypto.randomUUID()}.db`;
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
      title: "Main Conversation",
      summary: "Starter summary",
      createdAt: now,
      updatedAt: now,
    });

    store.saveChatMessage({
      id: "msg-1",
      conversationId: "conv-1",
      role: "user",
      content: "hello",
      metadata: { source: "test" },
      createdAt: now,
    });
    store.saveChatMessage({
      id: "msg-2",
      conversationId: "conv-1",
      role: "assistant",
      content: "hi there",
      createdAt: now + 1,
    });

    const conversation = store.getConversation("conv-1");
    expect(conversation?.title).toBe("Main Conversation");
    expect(conversation?.summary).toBe("Starter summary");
    expect(store.listConversations(10).length).toBe(1);

    const messages = store.listChatMessages("conv-1", 10);
    expect(messages.length).toBe(2);
    expect(messages[0]?.role).toBe("user");
    expect((messages[0]?.metadata as { source?: string } | undefined)?.source).toBe("test");
    expect(messages[1]?.role).toBe("assistant");

    store.close();
  });

  test("creates conversation tables in migrations", () => {
    const dbPath = `/tmp/trenchclaw-conversations-${crypto.randomUUID()}.db`;
    dbPaths.push(dbPath);

    const store = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });
    store.close();

    const db = new Database(dbPath, { readonly: true, strict: true });
    const rows = db
      .query(
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name IN ('conversations', 'chat_messages')
        ORDER BY name ASC
      `,
      )
      .all() as { name: string }[];

    expect(rows).toEqual([{ name: "chat_messages" }, { name: "conversations" }]);

    db.close(false);
  });

  test("sqlite zod table schemas match created sqlite tables", () => {
    const dbPath = `/tmp/trenchclaw-schema-sync-${crypto.randomUUID()}.db`;
    dbPaths.push(dbPath);

    const store = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });
    store.close();

    const db = new Database(dbPath, { readonly: true, strict: true });
    const rows = db
      .query(
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name ASC
      `,
      )
      .all() as { name: string }[];

    const tableNames = rows.map((row) => row.name);
    expect(tableNames).toEqual(Object.keys(sqliteTables).sort());

    db.close(false);
  });

  test("auto-sync adds missing columns on existing tables", () => {
    const dbPath = `/tmp/trenchclaw-auto-sync-${crypto.randomUUID()}.db`;
    dbPaths.push(dbPath);

    const seedDb = new Database(dbPath, { create: true, strict: true });
    seedDb.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    seedDb.close(false);

    const store = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });
    const syncReport = store.getSchemaSyncReport();
    expect(syncReport.addedColumns.includes("conversations.session_id")).toBe(true);
    expect(syncReport.addedColumns.includes("conversations.title")).toBe(true);
    expect(syncReport.addedColumns.includes("conversations.summary")).toBe(true);
    store.close();

    const db = new Database(dbPath, { readonly: true, strict: true });
    const columnRows = db
      .query(`PRAGMA table_info("conversations")`)
      .all() as { name: string }[];
    const columns = new Set(columnRows.map((row) => row.name));
    expect(columns.has("session_id")).toBe(true);
    expect(columns.has("title")).toBe(true);
    expect(columns.has("summary")).toBe(true);
    db.close(false);
  });

  test("schema snapshot is available from store", () => {
    const dbPath = `/tmp/trenchclaw-schema-snapshot-${crypto.randomUUID()}.db`;
    dbPaths.push(dbPath);

    const store = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });
    const snapshot = store.getSchemaSnapshot();
    expect(snapshot.includes("SQLite schema snapshot")).toBe(true);
    expect(snapshot.includes("conversations")).toBe(true);
    expect(snapshot.includes("chat_messages")).toBe(true);
    store.close();
  });
});
