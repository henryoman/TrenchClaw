import { mkdirSync } from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";

import type { ActionResult } from "../../ai/runtime/types/action";
import type {
  ChatMessageState,
  ConversationState,
  JobState,
  JobStatus,
  StateStore,
} from "../../ai/runtime/types/state";
import {
  actionResultSchema,
  chatMessageStateSchema,
  conversationStateSchema,
  httpCacheEntryInputSchema,
  httpCacheEntryRecordSchema,
  jobStateSchema,
  marketInstrumentInputSchema,
  marketSnapshotInputSchema,
  marketSnapshotRecordSchema,
  ohlcvBarRecordSchema,
  runtimeRetentionInputSchema,
  runtimeRetentionResultSchema,
  saveOhlcvBarsInputSchema,
  sqliteStateStoreConfigSchema,
  type HttpCacheEntryInput,
  type HttpCacheEntryRecord,
  type MarketInstrumentInput,
  type MarketSnapshotInput,
  type MarketSnapshotRecord,
  type OhlcvBarInput,
  type OhlcvBarRecord,
  type SaveOhlcvBarsInput,
} from "./schema";
import { getSqliteSchemaSnapshot, syncSqliteSchema, type SqliteSchemaSyncReport } from "./sqlite-orm";
import { sqliteChatMessageRowSchema, sqliteConversationRowSchema, sqliteJobRowSchema } from "./sqlite-schema";

export type SqliteStateStoreConfig = {
  path: string;
  walMode: boolean;
  busyTimeoutMs: number;
};

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
  private readonly schemaSyncReport: SqliteSchemaSyncReport;

  constructor(config: SqliteStateStoreConfig) {
    this.config = sqliteStateStoreConfigSchema.parse(config);
    const absolutePath = toAbsolutePath(this.config.path);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    this.db = new Database(absolutePath, { create: true, strict: true });

    this.configureConnection();
    this.schemaSyncReport = syncSqliteSchema(this.db);
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

  saveConversation(conversation: ConversationState): void {
    const parsed = conversationStateSchema.parse(conversation);
    this.db
      .query(
        `
        INSERT INTO conversations (id, session_id, title, summary, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          session_id = excluded.session_id,
          title = excluded.title,
          summary = excluded.summary,
          updated_at = excluded.updated_at
      `,
      )
      .run(
        parsed.id,
        parsed.sessionId ?? null,
        parsed.title ?? null,
        parsed.summary ?? null,
        parsed.createdAt,
        parsed.updatedAt,
      );
  }

  getConversation(id: string): ConversationState | null {
    const row = this.db
      .query(
        `
        SELECT id, session_id, title, summary, created_at, updated_at
        FROM conversations
        WHERE id = ?
      `,
      )
      .get(id) as Record<string, unknown> | null;

    if (!row) {
      return null;
    }

    const parsed = sqliteConversationRowSchema.parse(row);
    return conversationStateSchema.parse({
      id: parsed.id,
      sessionId: parsed.session_id ?? undefined,
      title: parsed.title ?? undefined,
      summary: parsed.summary ?? undefined,
      createdAt: parsed.created_at,
      updatedAt: parsed.updated_at,
    });
  }

  listConversations(limit = 100): ConversationState[] {
    const rows = this.db
      .query(
        `
        SELECT id, session_id, title, summary, created_at, updated_at
        FROM conversations
        ORDER BY updated_at DESC
        LIMIT ?
      `,
      )
      .all(Math.max(1, Math.trunc(limit))) as Record<string, unknown>[];

    return rows.map((row) => {
      const parsed = sqliteConversationRowSchema.parse(row);
      return conversationStateSchema.parse({
        id: parsed.id,
        sessionId: parsed.session_id ?? undefined,
        title: parsed.title ?? undefined,
        summary: parsed.summary ?? undefined,
        createdAt: parsed.created_at,
        updatedAt: parsed.updated_at,
      });
    });
  }

  saveChatMessage(message: ChatMessageState): void {
    const parsed = chatMessageStateSchema.parse(message);
    this.db
      .query(
        `
        INSERT INTO chat_messages (id, conversation_id, role, content, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          conversation_id = excluded.conversation_id,
          role = excluded.role,
          content = excluded.content,
          metadata_json = excluded.metadata_json,
          created_at = excluded.created_at
      `,
      )
      .run(
        parsed.id,
        parsed.conversationId,
        parsed.role,
        parsed.content,
        parsed.metadata === undefined ? null : JSON.stringify(parsed.metadata),
        parsed.createdAt,
      );
  }

  listChatMessages(conversationId: string, limit = 500): ChatMessageState[] {
    const rows = this.db
      .query(
        `
        SELECT id, conversation_id, role, content, metadata_json, created_at
        FROM chat_messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        LIMIT ?
      `,
      )
      .all(conversationId, Math.max(1, Math.trunc(limit))) as Record<string, unknown>[];

    return rows.map((row) => {
      const parsed = sqliteChatMessageRowSchema.parse(row);
      return chatMessageStateSchema.parse({
        id: parsed.id,
        conversationId: parsed.conversation_id,
        role: parsed.role,
        content: parsed.content,
        metadata:
          parsed.metadata_json == null
            ? undefined
            : parseJson<Record<string, unknown> | undefined>(parsed.metadata_json, undefined),
        createdAt: parsed.created_at,
      });
    });
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
  }): { receiptsDeleted: number; cacheDeleted: number } {
    const parsedRetention = runtimeRetentionInputSchema.parse(retention);
    const now = Date.now();
    const receiptsCutoff = now - Math.max(1, Math.trunc(parsedRetention.receiptsDays)) * 24 * 60 * 60 * 1000;

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

      const cacheDeleted = this.pruneExpiredCache(now);

      return {
        receiptsDeleted,
        cacheDeleted,
      };
    });

    return runtimeRetentionResultSchema.parse(prune());
  }

  close(): void {
    this.db.close(false);
  }

  getSchemaSyncReport(): SqliteSchemaSyncReport {
    return { ...this.schemaSyncReport };
  }

  getSchemaSnapshot(): string {
    return getSqliteSchemaSnapshot();
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

  // DB schema is now synced from sqlite-orm table specs on boot.
}
