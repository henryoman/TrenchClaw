import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import path from "node:path";

import { RuntimeLogger, type RuntimeLogEntry } from "../../../apps/trenchclaw/src/runtime/logger";
import { SessionLogStore, SessionSummaryStore } from "../../../apps/trenchclaw/src/runtime/storage/session-stores";
import { SqliteStateStore } from "../../../apps/trenchclaw/src/runtime/storage/sqlite-state-store";
import { SummaryLogStore, SystemLogStore } from "../../../apps/trenchclaw/src/runtime/storage/log-files";
import { runtimeStatePath } from "../../helpers/core-paths";

const tmpTargets: string[] = [];

const waitForFileText = async (filePath: string, timeoutMs = 2_000): Promise<string> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await Bun.file(filePath).exists()) {
      return Bun.file(filePath).text();
    }
    await Bun.sleep(25);
  }
  throw new Error(`Timed out waiting for file: ${filePath}`);
};

afterEach(async () => {
  for (const target of tmpTargets.splice(0)) {
    await Bun.$`rm -rf ${target}`.quiet();
  }
});

describe("SystemLogStore + SessionSummaryStore", () => {
  test("writes runtime logger entries to daily system log files", async () => {
    const root = path.resolve(
      runtimeStatePath("instances/01/logs/.tests"),
      `system-log-${crypto.randomUUID()}`,
    );
    tmpTargets.push(root);

    const logger = new RuntimeLogger({
      level: "info",
      style: "human",
      pretty: true,
    });
    const systemLogStore = new SystemLogStore({
      directory: `${root}/system`,
    });
    const unsubscribe = logger.subscribe((entry: RuntimeLogEntry) => {
      systemLogStore.append(entry);
    });

    logger.info("runtime:boot", { profile: "dangerous" });
    unsubscribe();

    const logPath = `${root}/system/${new Date().toISOString().slice(0, 10)}.system.jsonl`;
    const content = await waitForFileText(logPath);
    expect(content.includes("runtime:boot")).toBe(true);
    expect(content.includes("dangerous")).toBe(true);
  });

  test("creates structured JSON summaries for sessions", async () => {
    const root = path.resolve(
      runtimeStatePath("instances/01/logs/.tests"),
      `session-summary-${crypto.randomUUID()}`,
    );
    tmpTargets.push(root);

    const sessions = new SessionLogStore({
      directory: `${root}/sessions`,
      agentId: "agent-1",
      sessionKey: "agent:agent-1:main",
      source: "runtime",
    });
    const active = await sessions.open();
    await sessions.appendMessage("system", "runtime started");
    await sessions.appendEvent("action:start", { actionName: "createWallets" });

    const stats = await sessions.getActiveSessionStats();
    expect(stats).not.toBeNull();
    if (!stats) {
      throw new Error("expected active session stats");
    }

    const summaryStore = new SessionSummaryStore({
      directory: `${root}/summaries`,
    });
    const summaryPath = await summaryStore.writeSummary({
      ...stats,
      profile: "dangerous",
      schedulerTickMs: 1000,
      registeredActions: ["createWallets"],
      pendingJobsAtStop: 0,
    });

    const summary = JSON.parse(await Bun.file(summaryPath).text()) as {
      sessionId: string;
      messageCount: number;
      eventCount: number;
      compactionLevel: string;
    };
    expect(summaryPath.endsWith(`${active.sessionId}.summary.json`)).toBe(true);
    expect(summary.sessionId).toBe(active.sessionId);
    expect(summary.messageCount).toBe(1);
    expect(summary.eventCount).toBe(1);
    expect(summary.compactionLevel).toBe("basic");
  });

  test("writes concise summary entries to daily files", async () => {
    const root = path.resolve(
      runtimeStatePath("instances/01/logs/.tests"),
      `runtime-summary-${crypto.randomUUID()}`,
    );
    tmpTargets.push(root);

    const summaryStore = new SummaryLogStore({
      directory: `${root}/summaries`,
    });
    summaryStore.append({
      timestamp: new Date().toISOString(),
      category: "trade",
      event: "trade:executed",
      details: { actionName: "ultraSwap", txSignature: "abc123" },
    });

    const logPath = `${root}/summaries/${new Date().toISOString().slice(0, 10)}.summary.jsonl`;
    const content = await waitForFileText(logPath);
    expect(content.includes("\"category\":\"trade\"")).toBe(true);
    expect(content.includes("trade:executed")).toBe(true);
    expect(content.includes("ultraSwap")).toBe(true);
  });

  test("stores session activity and summaries in sqlite when provided", async () => {
    const root = path.resolve(
      runtimeStatePath("instances/01/logs/.tests"),
      `sqlite-session-summary-${crypto.randomUUID()}`,
    );
    tmpTargets.push(root);
    const dbPath = `${root}/runtime.db`;

    const sqliteStore = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });

    const sessions = new SessionLogStore({
      directory: `${root}/sessions`,
      agentId: "agent-1",
      sessionKey: "agent:agent-1:main",
      source: "runtime",
      sqliteStateStore: sqliteStore,
    });
    const active = await sessions.open();
    await sessions.appendMessage("system", "runtime started");
    await sessions.appendEvent("action:start", { actionName: "createWallets" });

    const stats = await sessions.getActiveSessionStats();
    expect(stats?.sessionId).toBe(active.sessionId);
    expect(stats?.messageCount).toBe(1);
    expect(stats?.eventCount).toBe(1);

    const summaryStore = new SessionSummaryStore({
      directory: `${root}/summaries`,
      sqliteStateStore: sqliteStore,
    });
    const summaryPath = await summaryStore.writeSummary({
      sessionId: active.sessionId,
      sessionKey: active.sessionKey,
      source: active.source,
      createdAt: stats?.createdAt ?? new Date().toISOString(),
      updatedAt: stats?.updatedAt ?? new Date().toISOString(),
      messageCount: stats?.messageCount ?? 0,
      eventCount: stats?.eventCount ?? 0,
      profile: "dangerous",
      schedulerTickMs: 1000,
      registeredActions: ["createWallets"],
      pendingJobsAtStop: 0,
    });

    expect(summaryPath).toBe(`sqlite:${active.sessionId}:summary`);

    sqliteStore.close();
    const db = new Database(dbPath, { readonly: true, strict: true });
    const sessionRow = db
      .query(
        `
        SELECT session_id, message_count, event_count, ended_at
        FROM runtime_sessions
        WHERE session_id = ?
      `,
      )
      .get(active.sessionId) as {
        session_id: string;
        message_count: number;
        event_count: number;
        ended_at: number | null;
      } | null;
    const summaryRow = db
      .query(
        `
        SELECT session_id, profile, scheduler_tick_ms, pending_jobs_at_stop, duration_sec
        FROM runtime_session_summaries
        WHERE session_id = ?
      `,
      )
      .get(active.sessionId) as {
        session_id: string;
        profile: string;
        scheduler_tick_ms: number;
        pending_jobs_at_stop: number;
        duration_sec: number;
      } | null;

    expect(sessionRow?.session_id).toBe(active.sessionId);
    expect(sessionRow?.message_count).toBe(1);
    expect(sessionRow?.event_count).toBe(1);
    expect(typeof sessionRow?.ended_at).toBe("number");
    expect(summaryRow?.session_id).toBe(active.sessionId);
    expect(summaryRow?.profile).toBe("dangerous");
    expect(summaryRow?.scheduler_tick_ms).toBe(1000);
    expect(summaryRow?.pending_jobs_at_stop).toBe(0);
    expect(summaryRow?.duration_sec).toBeGreaterThanOrEqual(0);
    db.close(false);
  });
});
