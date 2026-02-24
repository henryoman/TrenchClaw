import { mkdirSync } from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";

import type { ActionResult } from "../../ai/contracts/action";
import type { DecisionLog, JobState, JobStatus, PolicyHit, StateStore } from "../../ai/contracts/state";

export interface SqliteStateStoreConfig {
  path: string;
  walMode: boolean;
  busyTimeoutMs: number;
}

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const toAbsolutePath = (filePath: string): string =>
  path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

export class SqliteStateStore implements StateStore {
  private readonly db: Database;

  constructor(private readonly config: SqliteStateStoreConfig) {
    const absolutePath = toAbsolutePath(config.path);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    this.db = new Database(absolutePath, { create: true });

    if (config.walMode) {
      this.db.exec("PRAGMA journal_mode = WAL;");
    }
    this.db.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.trunc(config.busyTimeoutMs))};`);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
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

      CREATE TABLE IF NOT EXISTS action_receipts (
        idempotency_key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS policy_hits (
        id TEXT PRIMARY KEY,
        action_name TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS decision_logs (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        action_name TEXT NOT NULL,
        trace_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  saveJob(job: JobState): void {
    const statement = this.db.query(`
      INSERT INTO jobs (
        id, bot_id, routine_name, status, config_json, next_run_at, last_run_at, cycles_completed,
        total_cycles, last_result_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        bot_id = excluded.bot_id,
        routine_name = excluded.routine_name,
        status = excluded.status,
        config_json = excluded.config_json,
        next_run_at = excluded.next_run_at,
        last_run_at = excluded.last_run_at,
        cycles_completed = excluded.cycles_completed,
        total_cycles = excluded.total_cycles,
        last_result_json = excluded.last_result_json,
        updated_at = excluded.updated_at
    `);

    statement.run(
      job.id,
      job.botId,
      job.routineName,
      job.status,
      JSON.stringify(job.config),
      job.nextRunAt ?? null,
      job.lastRunAt ?? null,
      job.cyclesCompleted,
      job.totalCycles ?? null,
      job.lastResult ? JSON.stringify(job.lastResult) : null,
      job.createdAt,
      job.updatedAt,
    );
  }

  getJob(id: string): JobState | null {
    const row = this.db
      .query(
        `
        SELECT *
        FROM jobs
        WHERE id = ?
      `,
      )
      .get(id) as Record<string, unknown> | null;

    if (!row) {
      return null;
    }

    return this.mapJobRow(row);
  }

  listJobs(filter?: { status?: JobStatus; botId?: string }): JobState[] {
    const clauses: string[] = [];
    const values: string[] = [];

    if (filter?.status) {
      clauses.push("status = ?");
      values.push(filter.status);
    }
    if (filter?.botId) {
      clauses.push("bot_id = ?");
      values.push(filter.botId);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .query(
        `
        SELECT *
        FROM jobs
        ${whereClause}
        ORDER BY created_at DESC
      `,
      )
      .all(...values) as Record<string, unknown>[];

    return rows.map((row) => this.mapJobRow(row));
  }

  updateJobStatus(id: string, status: JobStatus, meta: Partial<JobState> = {}): void {
    const current = this.getJob(id);
    if (!current) {
      return;
    }

    const next: JobState = {
      ...current,
      ...meta,
      status,
      updatedAt: Date.now(),
    };
    this.saveJob(next);
  }

  saveReceipt(receipt: ActionResult): void {
    this.db
      .query(
        `
        INSERT INTO action_receipts (idempotency_key, payload_json, timestamp)
        VALUES (?, ?, ?)
        ON CONFLICT(idempotency_key) DO UPDATE SET
          payload_json = excluded.payload_json,
          timestamp = excluded.timestamp
      `,
      )
      .run(receipt.idempotencyKey, JSON.stringify(receipt), receipt.timestamp);
  }

  getReceipt(idempotencyKey: string): ActionResult | null {
    const row = this.db
      .query(
        `
        SELECT payload_json
        FROM action_receipts
        WHERE idempotency_key = ?
      `,
      )
      .get(idempotencyKey) as { payload_json: string } | null;

    if (!row) {
      return null;
    }

    return parseJson<ActionResult | null>(row.payload_json, null);
  }

  savePolicyHit(hit: PolicyHit): void {
    this.db
      .query(
        `
        INSERT INTO policy_hits (id, action_name, result_json, created_at)
        VALUES (?, ?, ?, ?)
      `,
      )
      .run(hit.id, hit.actionName, JSON.stringify(hit.result), hit.createdAt);
  }

  saveDecisionLog(log: DecisionLog): void {
    this.db
      .query(
        `
        INSERT INTO decision_logs (id, job_id, action_name, trace_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(log.id, log.jobId ?? null, log.actionName, JSON.stringify(log.trace), log.createdAt);
  }

  getRecentReceipts(limit: number): ActionResult[] {
    const rows = this.db
      .query(
        `
        SELECT payload_json
        FROM action_receipts
        ORDER BY timestamp DESC
        LIMIT ?
      `,
      )
      .all(Math.max(1, Math.trunc(limit))) as { payload_json: string }[];

    return rows
      .map((row) => parseJson<ActionResult | null>(row.payload_json, null))
      .filter((row): row is ActionResult => row !== null);
  }

  close(): void {
    this.db.close(false);
  }

  private mapJobRow(row: Record<string, unknown>): JobState {
    return {
      id: String(row.id),
      botId: String(row.bot_id),
      routineName: String(row.routine_name),
      status: row.status as JobStatus,
      config: parseJson<Record<string, unknown>>(String(row.config_json), {}),
      nextRunAt: row.next_run_at == null ? undefined : Number(row.next_run_at),
      lastRunAt: row.last_run_at == null ? undefined : Number(row.last_run_at),
      cyclesCompleted: Number(row.cycles_completed),
      totalCycles: row.total_cycles == null ? undefined : Number(row.total_cycles),
      lastResult:
        row.last_result_json == null
          ? undefined
          : parseJson<ActionResult | undefined>(String(row.last_result_json), undefined),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }
}
