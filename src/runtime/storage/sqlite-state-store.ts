import { mkdirSync } from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";

import type { ActionResult } from "../../ai/contracts/action";
import type { DecisionLog, JobState, JobStatus, PolicyHit, StateStore } from "../../ai/contracts/state";
import {
  actionResultSchema,
  decisionLogSchema,
  httpCacheEntryInputSchema,
  httpCacheEntryRecordSchema,
  jobStateSchema,
  marketInstrumentInputSchema,
  marketSnapshotInputSchema,
  marketSnapshotRecordSchema,
  ohlcvBarRecordSchema,
  policyHitSchema,
  runtimeRetentionInputSchema,
  runtimeRetentionResultSchema,
  saveOhlcvBarsInputSchema,
  sqliteJobRowSchema,
  sqliteStateStoreConfigSchema,
  type HttpCacheEntryInput,
  type HttpCacheEntryRecord,
  type MarketInstrumentInput,
  type MarketSnapshotInput,
  type MarketSnapshotRecord,
  type OhlcvBarInput,
  type OhlcvBarRecord,
  type RuntimeRetentionInput,
  type RuntimeRetentionResult,
  type SaveOhlcvBarsInput,
} from "./schema";

export type SqliteStateStoreConfig = {
  path: string;
  walMode: boolean;
  busyTimeoutMs: number;
};

const CURRENT_SCHEMA_VERSION = 2;

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const parseJsonWithSchema = <T>(
  value: string,
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false } },
  fallback: T,
): T => {
  const parsed = parseJson<unknown>(value, null);
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return fallback;
  }
  return result.data;
};

const toAbsolutePath = (filePath: string): string =>
  path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNullableString = (value: unknown): string | undefined => {
  if (value == null) {
    return undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
};

export class SqliteStateStore implements StateStore {
  private readonly db: Database;
  private readonly config: SqliteStateStoreConfig;

  constructor(config: SqliteStateStoreConfig) {
    this.config = sqliteStateStoreConfigSchema.parse(config);
    const absolutePath = toAbsolutePath(this.config.path);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    this.db = new Database(absolutePath, { create: true, strict: true });

    this.configureConnection();
    this.runMigrations();
  }

  saveJob(job: JobState): void {
    const parsedJob = jobStateSchema.parse(job);
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
      parsedJob.id,
      parsedJob.botId,
      parsedJob.routineName,
      parsedJob.status,
      JSON.stringify(parsedJob.config),
      parsedJob.nextRunAt ?? null,
      parsedJob.lastRunAt ?? null,
      parsedJob.cyclesCompleted,
      parsedJob.totalCycles ?? null,
      parsedJob.lastResult ? JSON.stringify(parsedJob.lastResult) : null,
      parsedJob.createdAt,
      parsedJob.updatedAt,
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
    const parsedReceipt = actionResultSchema.parse(receipt);
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
      .run(parsedReceipt.idempotencyKey, JSON.stringify(parsedReceipt), parsedReceipt.timestamp);
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

    return parseJsonWithSchema<ActionResult | null>(
      row.payload_json,
      actionResultSchema,
      null,
    );
  }

  savePolicyHit(hit: PolicyHit): void {
    const parsedHit = policyHitSchema.parse(hit);
    this.db
      .query(
        `
        INSERT INTO policy_hits (id, action_name, result_json, created_at)
        VALUES (?, ?, ?, ?)
      `,
      )
      .run(parsedHit.id, parsedHit.actionName, JSON.stringify(parsedHit.result), parsedHit.createdAt);
  }

  saveDecisionLog(log: DecisionLog): void {
    const parsedLog = decisionLogSchema.parse(log);
    this.db
      .query(
        `
        INSERT INTO decision_logs (id, job_id, action_name, trace_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(
        parsedLog.id,
        parsedLog.jobId ?? null,
        parsedLog.actionName,
        JSON.stringify(parsedLog.trace),
        parsedLog.createdAt,
      );
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
      .map((row) => parseJsonWithSchema<ActionResult | null>(row.payload_json, actionResultSchema, null))
      .filter((row): row is ActionResult => row !== null);
  }

  upsertMarketInstrument(input: MarketInstrumentInput): number {
    const parsedInput = marketInstrumentInputSchema.parse(input);
    const chain = parsedInput.chain.trim();
    const address = parsedInput.address.trim();
    if (!chain || !address) {
      throw new Error("upsertMarketInstrument requires non-empty chain and address");
    }

    this.db
      .query(
        `
        INSERT INTO market_instruments (chain, address, symbol, name, decimals, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(chain, address) DO UPDATE SET
          symbol = COALESCE(excluded.symbol, market_instruments.symbol),
          name = COALESCE(excluded.name, market_instruments.name),
          decimals = COALESCE(excluded.decimals, market_instruments.decimals),
          updated_at = excluded.updated_at
      `,
      )
      .run(
        chain,
        address,
        toNullableString(parsedInput.symbol) ?? null,
        toNullableString(parsedInput.name) ?? null,
        parsedInput.decimals ?? null,
        Date.now(),
        Date.now(),
      );

    const row = this.db
      .query(
        `
        SELECT id
        FROM market_instruments
        WHERE chain = ? AND address = ?
      `,
      )
      .get(chain, address) as { id: number } | null;

    if (!row) {
      throw new Error(`failed to upsert market instrument ${chain}:${address}`);
    }

    return row.id;
  }

  saveOhlcvBars(input: SaveOhlcvBarsInput): number {
    const parsedInput = saveOhlcvBarsInputSchema.parse(input);
    const source = parsedInput.source.trim();
    const interval = parsedInput.interval.trim();
    const instrumentId = this.upsertMarketInstrument(parsedInput.instrument);
    const upsert = this.db.query(`
      INSERT INTO ohlcv_bars (
        instrument_id, source, interval, open_time, close_time, open, high, low, close,
        volume, trades, vwap, fetched_at, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(instrument_id, source, interval, open_time) DO UPDATE SET
        close_time = excluded.close_time,
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        close = excluded.close,
        volume = excluded.volume,
        trades = excluded.trades,
        vwap = excluded.vwap,
        fetched_at = excluded.fetched_at,
        raw_json = excluded.raw_json
    `);

    const runBatch = this.db.transaction((bars: OhlcvBarInput[]): number => {
      let writes = 0;
      for (const bar of bars) {
        upsert.run(
          instrumentId,
          source,
          interval,
          Math.trunc(bar.openTime),
          Math.trunc(bar.closeTime),
          bar.open,
          bar.high,
          bar.low,
          bar.close,
          bar.volume ?? null,
          bar.trades ?? null,
          bar.vwap ?? null,
          Math.trunc(bar.fetchedAt ?? Date.now()),
          bar.raw === undefined ? null : JSON.stringify(bar.raw),
        );
        writes += 1;
      }
      return writes;
    });

    return runBatch(parsedInput.bars);
  }

  getOhlcvBars(input: {
    instrument: Pick<MarketInstrumentInput, "chain" | "address">;
    source: string;
    interval: string;
    fromTime?: number;
    toTime?: number;
    limit?: number;
  }): OhlcvBarRecord[] {
    const parsedInput = {
      instrument: marketInstrumentInputSchema.pick({ chain: true, address: true }).parse(input.instrument),
      source: input.source.trim(),
      interval: input.interval.trim(),
      fromTime: input.fromTime,
      toTime: input.toTime,
      limit: input.limit,
    };
    const chain = parsedInput.instrument.chain;
    const address = parsedInput.instrument.address;
    const source = parsedInput.source;
    const interval = parsedInput.interval;

    const rows = this.db
      .query(
        `
        SELECT
          mi.chain,
          mi.address,
          b.source,
          b.interval,
          b.open_time,
          b.close_time,
          b.open,
          b.high,
          b.low,
          b.close,
          b.volume,
          b.trades,
          b.vwap,
          b.fetched_at,
          b.raw_json
        FROM ohlcv_bars b
        JOIN market_instruments mi ON mi.id = b.instrument_id
        WHERE mi.chain = ?
          AND mi.address = ?
          AND b.source = ?
          AND b.interval = ?
          AND (? IS NULL OR b.open_time >= ?)
          AND (? IS NULL OR b.open_time <= ?)
        ORDER BY b.open_time DESC
        LIMIT ?
      `,
      )
      .all(
        chain,
        address,
        source,
        interval,
        parsedInput.fromTime ?? null,
        parsedInput.fromTime ?? null,
        parsedInput.toTime ?? null,
        parsedInput.toTime ?? null,
        Math.max(1, Math.trunc(parsedInput.limit ?? 500)),
      ) as Record<string, unknown>[];

    return rows.map((row) =>
      ohlcvBarRecordSchema.parse({
      chain: String(row.chain),
      address: String(row.address),
      source: String(row.source),
      interval: String(row.interval),
      openTime: Number(row.open_time),
      closeTime: Number(row.close_time),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: toFiniteNumber(row.volume) ?? undefined,
      trades: toFiniteNumber(row.trades) ?? undefined,
      vwap: toFiniteNumber(row.vwap) ?? undefined,
      fetchedAt: Number(row.fetched_at),
      raw: row.raw_json == null ? undefined : parseJson<unknown>(String(row.raw_json), undefined),
      }),
    );
  }

  saveMarketSnapshot(input: MarketSnapshotInput): string {
    const parsedInput = marketSnapshotInputSchema.parse(input);
    const instrumentId = this.upsertMarketInstrument(parsedInput.instrument);
    const id = crypto.randomUUID();
    const timestamp = Math.trunc(parsedInput.timestamp ?? Date.now());

    this.db
      .query(
        `
        INSERT INTO market_snapshots (
          id, instrument_id, source, snapshot_type, data_json, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        instrumentId,
        parsedInput.source.trim(),
        parsedInput.snapshotType.trim(),
        JSON.stringify(parsedInput.data),
        timestamp,
      );

    return id;
  }

  getLatestMarketSnapshot(input: {
    instrument: Pick<MarketInstrumentInput, "chain" | "address">;
    source: string;
    snapshotType: string;
  }): MarketSnapshotRecord | null {
    const row = this.db
      .query(
        `
        SELECT
          ms.id,
          mi.chain,
          mi.address,
          ms.source,
          ms.snapshot_type,
          ms.data_json,
          ms.timestamp
        FROM market_snapshots ms
        JOIN market_instruments mi ON mi.id = ms.instrument_id
        WHERE mi.chain = ?
          AND mi.address = ?
          AND ms.source = ?
          AND ms.snapshot_type = ?
        ORDER BY ms.timestamp DESC
        LIMIT 1
      `,
      )
      .get(
        input.instrument.chain.trim(),
        input.instrument.address.trim(),
        input.source.trim(),
        input.snapshotType.trim(),
      ) as Record<string, unknown> | null;

    if (!row) {
      return null;
    }

    return marketSnapshotRecordSchema.parse({
      id: String(row.id),
      chain: String(row.chain),
      address: String(row.address),
      source: String(row.source),
      snapshotType: String(row.snapshot_type),
      data: parseJson<unknown>(String(row.data_json), null),
      timestamp: Number(row.timestamp),
    });
  }

  saveHttpCacheEntry(input: HttpCacheEntryInput): void {
    const parsedInput = httpCacheEntryInputSchema.parse(input);
    const fetchedAt = Math.trunc(parsedInput.fetchedAt ?? Date.now());

    this.db
      .query(
        `
        INSERT INTO http_cache (
          cache_key, source, endpoint, request_hash, response_json, status_code, etag,
          last_modified, fetched_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          source = excluded.source,
          endpoint = excluded.endpoint,
          request_hash = excluded.request_hash,
          response_json = excluded.response_json,
          status_code = excluded.status_code,
          etag = excluded.etag,
          last_modified = excluded.last_modified,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at
      `,
      )
      .run(
        parsedInput.cacheKey,
        parsedInput.source,
        parsedInput.endpoint,
        parsedInput.requestHash,
        JSON.stringify(parsedInput.response),
        Math.trunc(parsedInput.statusCode),
        parsedInput.etag ?? null,
        parsedInput.lastModified ?? null,
        fetchedAt,
        parsedInput.expiresAt ?? null,
      );
  }

  getHttpCacheEntry(cacheKey: string): HttpCacheEntryRecord | null {
    const row = this.db
      .query(
        `
        SELECT *
        FROM http_cache
        WHERE cache_key = ?
      `,
      )
      .get(cacheKey) as Record<string, unknown> | null;

    if (!row) {
      return null;
    }

    const expiresAt = toFiniteNumber(row.expires_at);
    if (expiresAt !== null && expiresAt <= Date.now()) {
      return null;
    }

    return httpCacheEntryRecordSchema.parse({
      cacheKey: String(row.cache_key),
      source: String(row.source),
      endpoint: String(row.endpoint),
      requestHash: String(row.request_hash),
      response: parseJson<unknown>(String(row.response_json), null),
      statusCode: Number(row.status_code),
      etag: toNullableString(row.etag),
      lastModified: toNullableString(row.last_modified),
      fetchedAt: Number(row.fetched_at),
      expiresAt: expiresAt ?? undefined,
    });
  }

  pruneExpiredCache(now = Date.now()): number {
    const info = this.db
      .query(
        `
        DELETE FROM http_cache
        WHERE expires_at IS NOT NULL AND expires_at <= ?
      `,
      )
      .run(Math.trunc(now));

    return Number(info.changes ?? 0);
  }

  pruneRuntimeData(retention: {
    receiptsDays: number;
    policyHitsDays: number;
    decisionLogsDays: number;
  }): { receiptsDeleted: number; policyHitsDeleted: number; decisionLogsDeleted: number; cacheDeleted: number } {
    const parsedRetention = runtimeRetentionInputSchema.parse(retention);
    const now = Date.now();
    const receiptsCutoff = now - Math.max(1, Math.trunc(parsedRetention.receiptsDays)) * 24 * 60 * 60 * 1000;
    const policyCutoff = now - Math.max(1, Math.trunc(parsedRetention.policyHitsDays)) * 24 * 60 * 60 * 1000;
    const decisionCutoff = now - Math.max(1, Math.trunc(parsedRetention.decisionLogsDays)) * 24 * 60 * 60 * 1000;

    const prune = this.db.transaction(() => {
      const receiptsDeleted = Number(
        this.db
          .query(
            `
            DELETE FROM action_receipts
            WHERE timestamp < ?
          `,
          )
          .run(receiptsCutoff).changes ?? 0,
      );

      const policyHitsDeleted = Number(
        this.db
          .query(
            `
            DELETE FROM policy_hits
            WHERE created_at < ?
          `,
          )
          .run(policyCutoff).changes ?? 0,
      );

      const decisionLogsDeleted = Number(
        this.db
          .query(
            `
            DELETE FROM decision_logs
            WHERE created_at < ?
          `,
          )
          .run(decisionCutoff).changes ?? 0,
      );

      const cacheDeleted = this.pruneExpiredCache(now);

      return {
        receiptsDeleted,
        policyHitsDeleted,
        decisionLogsDeleted,
        cacheDeleted,
      };
    });

    return runtimeRetentionResultSchema.parse(prune());
  }

  close(): void {
    this.db.close(false);
  }

  private mapJobRow(row: Record<string, unknown>): JobState {
    const parsedRow = sqliteJobRowSchema.parse(row);

    return jobStateSchema.parse({
      id: parsedRow.id,
      botId: parsedRow.bot_id,
      routineName: parsedRow.routine_name,
      status: parsedRow.status,
      config: parseJson<Record<string, unknown>>(parsedRow.config_json, {}),
      nextRunAt: parsedRow.next_run_at ?? undefined,
      lastRunAt: parsedRow.last_run_at ?? undefined,
      cyclesCompleted: parsedRow.cycles_completed,
      totalCycles: parsedRow.total_cycles ?? undefined,
      lastResult:
        parsedRow.last_result_json == null
          ? undefined
          : parseJsonWithSchema<ActionResult | undefined>(
              parsedRow.last_result_json,
              actionResultSchema,
              undefined,
            ),
      createdAt: parsedRow.created_at,
      updatedAt: parsedRow.updated_at,
    });
  }

  private configureConnection(): void {
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA temp_store = MEMORY;");
    this.db.exec("PRAGMA cache_size = -20000;");
    this.db.exec("PRAGMA mmap_size = 134217728;");

    if (this.config.walMode) {
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.db.exec("PRAGMA synchronous = NORMAL;");
    } else {
      this.db.exec("PRAGMA journal_mode = DELETE;");
      this.db.exec("PRAGMA synchronous = FULL;");
    }

    this.db.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.trunc(this.config.busyTimeoutMs))};`);
  }

  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);

    const row = this.db
      .query(
        `
        SELECT MAX(version) AS version
        FROM schema_migrations
      `,
      )
      .get() as { version: number | null } | null;

    let currentVersion = Number(row?.version ?? 0);

    if (currentVersion >= CURRENT_SCHEMA_VERSION) {
      return;
    }

    const apply = this.db.transaction(() => {
      while (currentVersion < CURRENT_SCHEMA_VERSION) {
        const nextVersion = currentVersion + 1;

        if (nextVersion === 1) {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS jobs (
              id TEXT PRIMARY KEY,
              bot_id TEXT NOT NULL,
              routine_name TEXT NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'stopped', 'failed')),
              config_json TEXT NOT NULL,
              next_run_at INTEGER,
              last_run_at INTEGER,
              cycles_completed INTEGER NOT NULL CHECK (cycles_completed >= 0),
              total_cycles INTEGER CHECK (total_cycles IS NULL OR total_cycles >= 0),
              last_result_json TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_jobs_status_next_run_at ON jobs(status, next_run_at);
            CREATE INDEX IF NOT EXISTS idx_jobs_bot_id_status ON jobs(bot_id, status);

            CREATE TABLE IF NOT EXISTS action_receipts (
              idempotency_key TEXT PRIMARY KEY,
              payload_json TEXT NOT NULL,
              timestamp INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_action_receipts_timestamp ON action_receipts(timestamp DESC);

            CREATE TABLE IF NOT EXISTS policy_hits (
              id TEXT PRIMARY KEY,
              action_name TEXT NOT NULL,
              result_json TEXT NOT NULL,
              created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_policy_hits_created_at ON policy_hits(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_policy_hits_action_name_created_at ON policy_hits(action_name, created_at DESC);

            CREATE TABLE IF NOT EXISTS decision_logs (
              id TEXT PRIMARY KEY,
              job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
              action_name TEXT NOT NULL,
              trace_json TEXT NOT NULL,
              created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_decision_logs_created_at ON decision_logs(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_decision_logs_job_id_created_at ON decision_logs(job_id, created_at DESC);
          `);
        }

        if (nextVersion === 2) {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS market_instruments (
              id INTEGER PRIMARY KEY,
              chain TEXT NOT NULL,
              address TEXT NOT NULL,
              symbol TEXT,
              name TEXT,
              decimals INTEGER CHECK (decimals IS NULL OR decimals >= 0),
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              UNIQUE(chain, address)
            );

            CREATE INDEX IF NOT EXISTS idx_market_instruments_chain_symbol ON market_instruments(chain, symbol);

            CREATE TABLE IF NOT EXISTS ohlcv_bars (
              instrument_id INTEGER NOT NULL REFERENCES market_instruments(id) ON DELETE CASCADE,
              source TEXT NOT NULL,
              interval TEXT NOT NULL,
              open_time INTEGER NOT NULL,
              close_time INTEGER NOT NULL,
              open REAL NOT NULL,
              high REAL NOT NULL,
              low REAL NOT NULL,
              close REAL NOT NULL,
              volume REAL,
              trades INTEGER,
              vwap REAL,
              fetched_at INTEGER NOT NULL,
              raw_json TEXT,
              PRIMARY KEY(instrument_id, source, interval, open_time)
            );

            CREATE INDEX IF NOT EXISTS idx_ohlcv_lookup ON ohlcv_bars(instrument_id, source, interval, open_time DESC);
            CREATE INDEX IF NOT EXISTS idx_ohlcv_fetched_at ON ohlcv_bars(fetched_at DESC);

            CREATE TABLE IF NOT EXISTS market_snapshots (
              id TEXT PRIMARY KEY,
              instrument_id INTEGER NOT NULL REFERENCES market_instruments(id) ON DELETE CASCADE,
              source TEXT NOT NULL,
              snapshot_type TEXT NOT NULL,
              data_json TEXT NOT NULL,
              timestamp INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_market_snapshots_lookup ON market_snapshots(instrument_id, source, snapshot_type, timestamp DESC);

            CREATE TABLE IF NOT EXISTS http_cache (
              cache_key TEXT PRIMARY KEY,
              source TEXT NOT NULL,
              endpoint TEXT NOT NULL,
              request_hash TEXT NOT NULL,
              response_json TEXT NOT NULL,
              status_code INTEGER NOT NULL,
              etag TEXT,
              last_modified TEXT,
              fetched_at INTEGER NOT NULL,
              expires_at INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_http_cache_expires_at ON http_cache(expires_at);
            CREATE INDEX IF NOT EXISTS idx_http_cache_source_endpoint ON http_cache(source, endpoint);
          `);
        }

        this.db
          .query(
            `
            INSERT INTO schema_migrations (version, applied_at)
            VALUES (?, ?)
          `,
          )
          .run(nextVersion, Date.now());

        currentVersion = nextVersion;
      }
    });

    apply();
  }
}
