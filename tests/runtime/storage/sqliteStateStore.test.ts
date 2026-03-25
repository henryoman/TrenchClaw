import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import path from "node:path";

import type { ActionResult } from "../../../apps/trenchclaw/src/ai/contracts/types/action";
import {
  getSqliteTableContractViolationsSnapshot,
  inspectSqliteSchema,
} from "../../../apps/trenchclaw/src/runtime/storage/sqliteOrm";
import { sqliteTables } from "../../../apps/trenchclaw/src/runtime/storage/sqliteSchema";
import { SqliteStateStore } from "../../../apps/trenchclaw/src/runtime/storage/sqliteStateStore";
import { runtimeStatePath } from "../../helpers/corePaths";

const dbPaths: string[] = [];
const RUNTIME_DB_DIRECTORY = runtimeStatePath("instances/01/data/.tests");
const createTestDbPath = (name: string): string =>
  path.join(RUNTIME_DB_DIRECTORY, `${name}-${crypto.randomUUID()}.db`);

afterEach(() => {
  for (const dbPath of dbPaths.splice(0)) {
    const file = Bun.file(dbPath);
    void file.delete().catch(() => {});
    void Bun.file(`${dbPath}-wal`).delete().catch(() => {});
    void Bun.file(`${dbPath}-shm`).delete().catch(() => {});
  }
});

describe("SqliteStateStore", () => {
  test("persists jobs and receipts", () => {
    const dbPath = createTestDbPath("trenchclaw-store");
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
    });
    expect(prune.receiptsDeleted).toBe(0);

    store.close();
  });

  test("stores and reads OHLCV chart bars", () => {
    const dbPath = createTestDbPath("trenchclaw-market");
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
    const dbPath = createTestDbPath("trenchclaw-chat");
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
    expect(messages[0]?.sequence).toBe(1);
    expect(messages[0]?.parts).toEqual([{ type: "text", text: "hello" }]);
    expect((messages[0]?.metadata as { source?: string } | undefined)?.source).toBe("test");
    expect(messages[1]?.role).toBe("assistant");
    expect(messages[1]?.sequence).toBe(2);
    expect(messages[1]?.parts).toEqual([{ type: "text", text: "hi there" }]);

    store.close();
  });

  test("creates conversation tables in migrations", () => {
    const dbPath = createTestDbPath("trenchclaw-conversations");
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
    const dbPath = createTestDbPath("trenchclaw-schema-sync");
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

  test("sqlite table specs stay aligned with row schemas", () => {
    expect(getSqliteTableContractViolationsSnapshot()).toEqual([]);
  });

  test("auto-sync adds missing columns on existing tables", () => {
    const dbPath = createTestDbPath("trenchclaw-auto-sync");
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

  test("auto-sync adds queue metadata columns on existing jobs tables", () => {
    const dbPath = createTestDbPath("trenchclaw-auto-sync-jobs");
    dbPaths.push(dbPath);

    const seedDb = new Database(dbPath, { create: true, strict: true });
    seedDb.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL,
        routine_name TEXT NOT NULL,
        status TEXT NOT NULL,
        config_json TEXT NOT NULL,
        next_run_at INTEGER,
        last_run_at INTEGER,
        cycles_completed INTEGER NOT NULL,
        total_cycles INTEGER,
        last_result_json TEXT,
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
    expect(syncReport.addedColumns.includes("jobs.attempt_count")).toBe(true);
    expect(syncReport.addedColumns.includes("jobs.lease_owner")).toBe(true);
    expect(syncReport.addedColumns.includes("jobs.lease_expires_at")).toBe(true);
    expect(syncReport.addedColumns.includes("jobs.last_error")).toBe(true);
    store.close();
  });

  test("schema inspection warns when an existing column contract drifts", () => {
    const dbPath = createTestDbPath("trenchclaw-schema-drift");
    dbPaths.push(dbPath);

    const seedDb = new Database(dbPath, { create: true, strict: true });
    seedDb.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        title TEXT,
        summary TEXT,
        created_at TEXT NOT NULL,
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
    expect(syncReport.warnings.some((warning) => warning.includes("conversations.created_at"))).toBe(true);
    store.close();

    const db = new Database(dbPath, { readonly: true, strict: true });
    const inspection = inspectSqliteSchema(db);
    expect(inspection.mismatchedColumns).toContain("conversations.created_at");
    db.close(false);
  });

  test("recovers interrupted running jobs on restart", () => {
    const dbPath = createTestDbPath("trenchclaw-recover-running");
    dbPaths.push(dbPath);
    const now = Date.now();

    const storeA = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });
    storeA.saveJob({
      id: "job-running-1",
      botId: "bot-1",
      routineName: "actionSequence",
      status: "running",
      config: {},
      cyclesCompleted: 0,
      attemptCount: 1,
      leaseOwner: "runtime-A",
      leaseExpiresAt: now + 60_000,
      createdAt: now,
      updatedAt: now,
    });
    storeA.close();

    const storeB = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });
    const recovered = storeB.recoverInterruptedJobs(now + 1_000);
    expect(recovered).toBe(1);
    const recoveredJob = storeB.getJob("job-running-1");
    expect(recoveredJob?.status).toBe("pending");
    expect(recoveredJob?.leaseOwner).toBeUndefined();
    expect(recoveredJob?.leaseExpiresAt).toBeUndefined();
    storeB.close();
  });

  test("schema snapshot is available from store", () => {
    const dbPath = createTestDbPath("trenchclaw-schema-snapshot");
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
