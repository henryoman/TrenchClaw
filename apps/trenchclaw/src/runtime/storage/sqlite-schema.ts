import { z } from "zod";

import {
  botIdSchema,
  chatMessageIdSchema,
  confidenceSchema,
  conversationIdSchema,
  factIdSchema,
  factKeySchema,
  idempotencyKeySchema,
  instanceIdSchema,
  jobIdSchema,
  nonEmptyTrimmedStringSchema,
  nonNegativeIntegerSchema,
  sessionIdSchema,
  unixMillisecondsSchema,
} from "./schema-primitives";

export type SqlitePrimitive = "TEXT" | "INTEGER" | "REAL" | "BLOB";

export type ForeignKeySpec = {
  table: string;
  column: string;
  onDelete?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";
};

export type ColumnSpec = {
  name: string;
  type: SqlitePrimitive;
  notNull?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  check?: string;
  references?: ForeignKeySpec;
};

export type IndexSpec = {
  name: string;
  columns: string[];
  unique?: boolean;
};

export type SqliteTableContract<TRowSchema extends z.ZodType = z.ZodType> = {
  name: string;
  rowSchema: TRowSchema;
  columns: readonly ColumnSpec[];
  tableChecks?: readonly string[];
  tableConstraints?: readonly string[];
  indexes?: readonly IndexSpec[];
};

const defineSqliteTable = <TName extends string, TRowSchema extends z.ZodType>(
  name: TName,
  contract: Omit<SqliteTableContract<TRowSchema>, "name">,
): SqliteTableContract<TRowSchema> & { name: TName } => ({
  name,
  ...contract,
});

const renderEnumCheck = (columnName: string, values: readonly string[]): string =>
  `${columnName} IN (${values.map((value) => `'${value}'`).join(", ")})`;

const SQLITE_JOB_STATUS_VALUES = ["pending", "running", "paused", "stopped", "failed"] as const;
const SQLITE_CHAT_ROLE_VALUES = ["system", "user", "assistant", "tool"] as const;

export const sqliteJobStatusSchema = z.enum(SQLITE_JOB_STATUS_VALUES);
export const sqliteChatRoleSchema = z.enum(SQLITE_CHAT_ROLE_VALUES);

export const sqliteSchemaMigrationTable = defineSqliteTable("schema_migrations", {
  rowSchema: z.object({
    version: z.number().int(),
    applied_at: unixMillisecondsSchema,
  }),
  columns: [
    { name: "version", type: "INTEGER", primaryKey: true },
    { name: "applied_at", type: "INTEGER", notNull: true },
  ],
});

export const sqliteJobTable = defineSqliteTable("jobs", {
  rowSchema: z.object({
    id: jobIdSchema,
    serial_number: nonNegativeIntegerSchema.nullable(),
    bot_id: botIdSchema,
    routine_name: nonEmptyTrimmedStringSchema,
    status: sqliteJobStatusSchema,
    config_json: z.string(),
    next_run_at: nonNegativeIntegerSchema.nullable(),
    last_run_at: nonNegativeIntegerSchema.nullable(),
    cycles_completed: nonNegativeIntegerSchema,
    total_cycles: nonNegativeIntegerSchema.nullable(),
    last_result_json: z.string().nullable(),
    attempt_count: nonNegativeIntegerSchema.nullable(),
    lease_owner: z.string().nullable(),
    lease_expires_at: nonNegativeIntegerSchema.nullable(),
    last_error: z.string().nullable(),
    created_at: unixMillisecondsSchema,
    updated_at: unixMillisecondsSchema,
  }),
  columns: [
    { name: "id", type: "TEXT", primaryKey: true },
    { name: "serial_number", type: "INTEGER", check: "serial_number IS NULL OR serial_number > 0" },
    { name: "bot_id", type: "TEXT", notNull: true },
    { name: "routine_name", type: "TEXT", notNull: true },
    { name: "status", type: "TEXT", notNull: true, check: renderEnumCheck("status", SQLITE_JOB_STATUS_VALUES) },
    { name: "config_json", type: "TEXT", notNull: true },
    { name: "next_run_at", type: "INTEGER" },
    { name: "last_run_at", type: "INTEGER" },
    { name: "cycles_completed", type: "INTEGER", notNull: true, check: "cycles_completed >= 0" },
    { name: "total_cycles", type: "INTEGER", check: "total_cycles IS NULL OR total_cycles >= 0" },
    { name: "last_result_json", type: "TEXT" },
    { name: "attempt_count", type: "INTEGER", check: "attempt_count IS NULL OR attempt_count >= 0" },
    { name: "lease_owner", type: "TEXT" },
    { name: "lease_expires_at", type: "INTEGER", check: "lease_expires_at IS NULL OR lease_expires_at >= 0" },
    { name: "last_error", type: "TEXT" },
    { name: "created_at", type: "INTEGER", notNull: true },
    { name: "updated_at", type: "INTEGER", notNull: true },
  ],
  indexes: [
    { name: "idx_jobs_serial_number", columns: ["serial_number"], unique: true },
    { name: "idx_jobs_status_next_run_at", columns: ["status", "next_run_at"] },
    { name: "idx_jobs_bot_id_status", columns: ["bot_id", "status"] },
    { name: "idx_jobs_lease_expires_at", columns: ["status", "lease_expires_at"] },
  ],
});

export const sqliteActionReceiptTable = defineSqliteTable("action_receipts", {
  rowSchema: z.object({
    idempotency_key: idempotencyKeySchema,
    payload_json: z.string(),
    timestamp: unixMillisecondsSchema,
  }),
  columns: [
    { name: "idempotency_key", type: "TEXT", primaryKey: true },
    { name: "payload_json", type: "TEXT", notNull: true },
    { name: "timestamp", type: "INTEGER", notNull: true },
  ],
  indexes: [{ name: "idx_action_receipts_timestamp", columns: ["timestamp"] }],
});

export const sqliteConversationTable = defineSqliteTable("conversations", {
  rowSchema: z.object({
    id: conversationIdSchema,
    session_id: sessionIdSchema.nullable(),
    title: z.string().nullable(),
    summary: z.string().nullable(),
    created_at: unixMillisecondsSchema,
    updated_at: unixMillisecondsSchema,
  }),
  columns: [
    { name: "id", type: "TEXT", primaryKey: true },
    { name: "session_id", type: "TEXT" },
    { name: "title", type: "TEXT" },
    { name: "summary", type: "TEXT" },
    { name: "created_at", type: "INTEGER", notNull: true },
    { name: "updated_at", type: "INTEGER", notNull: true },
  ],
  indexes: [{ name: "idx_conversations_updated_at", columns: ["updated_at"] }],
});

export const sqliteChatMessageTable = defineSqliteTable("chat_messages", {
  rowSchema: z.object({
    id: chatMessageIdSchema,
    conversation_id: conversationIdSchema,
    role: sqliteChatRoleSchema,
    content: z.string(),
    metadata_json: z.string().nullable(),
    created_at: unixMillisecondsSchema,
  }),
  columns: [
    { name: "id", type: "TEXT", primaryKey: true },
    {
      name: "conversation_id",
      type: "TEXT",
      notNull: true,
      references: { table: "conversations", column: "id", onDelete: "CASCADE" },
    },
    { name: "role", type: "TEXT", notNull: true, check: renderEnumCheck("role", SQLITE_CHAT_ROLE_VALUES) },
    { name: "content", type: "TEXT", notNull: true },
    { name: "metadata_json", type: "TEXT" },
    { name: "created_at", type: "INTEGER", notNull: true },
  ],
  indexes: [{ name: "idx_chat_messages_conversation_created_at", columns: ["conversation_id", "created_at"] }],
});

export const sqliteInstanceProfileTable = defineSqliteTable("instance_profiles", {
  rowSchema: z.object({
    instance_id: instanceIdSchema,
    display_name: z.string().nullable(),
    summary: z.string().nullable(),
    trading_style: z.string().nullable(),
    risk_tolerance: z.string().nullable(),
    preferred_assets_json: z.string().nullable(),
    disliked_assets_json: z.string().nullable(),
    metadata_json: z.string().nullable(),
    created_at: unixMillisecondsSchema,
    updated_at: unixMillisecondsSchema,
  }),
  columns: [
    { name: "instance_id", type: "TEXT", primaryKey: true },
    { name: "display_name", type: "TEXT" },
    { name: "summary", type: "TEXT" },
    { name: "trading_style", type: "TEXT" },
    { name: "risk_tolerance", type: "TEXT" },
    { name: "preferred_assets_json", type: "TEXT" },
    { name: "disliked_assets_json", type: "TEXT" },
    { name: "metadata_json", type: "TEXT" },
    { name: "created_at", type: "INTEGER", notNull: true },
    { name: "updated_at", type: "INTEGER", notNull: true },
  ],
  indexes: [{ name: "idx_instance_profiles_updated_at", columns: ["updated_at"] }],
});

export const sqliteInstanceFactTable = defineSqliteTable("instance_facts", {
  rowSchema: z.object({
    id: factIdSchema,
    instance_id: instanceIdSchema,
    fact_key: factKeySchema,
    fact_value_json: z.string(),
    confidence: confidenceSchema,
    source: nonEmptyTrimmedStringSchema,
    source_message_id: z.string().nullable(),
    created_at: unixMillisecondsSchema,
    updated_at: unixMillisecondsSchema,
    expires_at: nonNegativeIntegerSchema.nullable(),
  }),
  columns: [
    { name: "id", type: "TEXT", primaryKey: true },
    { name: "instance_id", type: "TEXT", notNull: true },
    { name: "fact_key", type: "TEXT", notNull: true },
    { name: "fact_value_json", type: "TEXT", notNull: true },
    { name: "confidence", type: "REAL", notNull: true, check: "confidence >= 0 AND confidence <= 1" },
    { name: "source", type: "TEXT", notNull: true },
    { name: "source_message_id", type: "TEXT" },
    { name: "created_at", type: "INTEGER", notNull: true },
    { name: "updated_at", type: "INTEGER", notNull: true },
    { name: "expires_at", type: "INTEGER", check: "expires_at IS NULL OR expires_at >= 0" },
  ],
  tableConstraints: ["UNIQUE(instance_id, fact_key)"],
  indexes: [
    { name: "idx_instance_facts_instance_updated", columns: ["instance_id", "updated_at"] },
    { name: "idx_instance_facts_expires_at", columns: ["expires_at"] },
  ],
});

export const sqliteMarketInstrumentTable = defineSqliteTable("market_instruments", {
  rowSchema: z.object({
    id: nonNegativeIntegerSchema,
    chain: nonEmptyTrimmedStringSchema,
    address: nonEmptyTrimmedStringSchema,
    symbol: z.string().nullable(),
    name: z.string().nullable(),
    decimals: nonNegativeIntegerSchema.nullable(),
    created_at: unixMillisecondsSchema,
    updated_at: unixMillisecondsSchema,
  }),
  columns: [
    { name: "id", type: "INTEGER", primaryKey: true },
    { name: "chain", type: "TEXT", notNull: true },
    { name: "address", type: "TEXT", notNull: true },
    { name: "symbol", type: "TEXT" },
    { name: "name", type: "TEXT" },
    { name: "decimals", type: "INTEGER", check: "decimals IS NULL OR decimals >= 0" },
    { name: "created_at", type: "INTEGER", notNull: true },
    { name: "updated_at", type: "INTEGER", notNull: true },
  ],
  tableConstraints: ["UNIQUE(chain, address)"],
  indexes: [{ name: "idx_market_instruments_chain_symbol", columns: ["chain", "symbol"] }],
});

export const sqliteOhlcvBarTable = defineSqliteTable("ohlcv_bars", {
  rowSchema: z.object({
    instrument_id: nonNegativeIntegerSchema,
    source: nonEmptyTrimmedStringSchema,
    interval: nonEmptyTrimmedStringSchema,
    open_time: unixMillisecondsSchema,
    close_time: unixMillisecondsSchema,
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number().nullable(),
    trades: z.number().int().nullable(),
    vwap: z.number().nullable(),
    fetched_at: unixMillisecondsSchema,
    raw_json: z.string().nullable(),
  }),
  columns: [
    {
      name: "instrument_id",
      type: "INTEGER",
      notNull: true,
      references: { table: "market_instruments", column: "id", onDelete: "CASCADE" },
    },
    { name: "source", type: "TEXT", notNull: true },
    { name: "interval", type: "TEXT", notNull: true },
    { name: "open_time", type: "INTEGER", notNull: true },
    { name: "close_time", type: "INTEGER", notNull: true },
    { name: "open", type: "REAL", notNull: true },
    { name: "high", type: "REAL", notNull: true },
    { name: "low", type: "REAL", notNull: true },
    { name: "close", type: "REAL", notNull: true },
    { name: "volume", type: "REAL" },
    { name: "trades", type: "INTEGER" },
    { name: "vwap", type: "REAL" },
    { name: "fetched_at", type: "INTEGER", notNull: true },
    { name: "raw_json", type: "TEXT" },
  ],
  tableConstraints: ["PRIMARY KEY(instrument_id, source, interval, open_time)"],
  indexes: [
    { name: "idx_ohlcv_lookup", columns: ["instrument_id", "source", "interval", "open_time"] },
    { name: "idx_ohlcv_fetched_at", columns: ["fetched_at"] },
  ],
});

export const sqliteMarketSnapshotTable = defineSqliteTable("market_snapshots", {
  rowSchema: z.object({
    id: nonEmptyTrimmedStringSchema,
    instrument_id: nonNegativeIntegerSchema,
    source: nonEmptyTrimmedStringSchema,
    snapshot_type: nonEmptyTrimmedStringSchema,
    data_json: z.string(),
    timestamp: unixMillisecondsSchema,
  }),
  columns: [
    { name: "id", type: "TEXT", primaryKey: true },
    {
      name: "instrument_id",
      type: "INTEGER",
      notNull: true,
      references: { table: "market_instruments", column: "id", onDelete: "CASCADE" },
    },
    { name: "source", type: "TEXT", notNull: true },
    { name: "snapshot_type", type: "TEXT", notNull: true },
    { name: "data_json", type: "TEXT", notNull: true },
    { name: "timestamp", type: "INTEGER", notNull: true },
  ],
  indexes: [{ name: "idx_market_snapshots_lookup", columns: ["instrument_id", "source", "snapshot_type", "timestamp"] }],
});

export const sqliteHttpCacheTable = defineSqliteTable("http_cache", {
  rowSchema: z.object({
    cache_key: nonEmptyTrimmedStringSchema,
    source: nonEmptyTrimmedStringSchema,
    endpoint: nonEmptyTrimmedStringSchema,
    request_hash: nonEmptyTrimmedStringSchema,
    response_json: z.string(),
    status_code: z.number().int(),
    etag: z.string().nullable(),
    last_modified: z.string().nullable(),
    fetched_at: unixMillisecondsSchema,
    expires_at: nonNegativeIntegerSchema.nullable(),
  }),
  columns: [
    { name: "cache_key", type: "TEXT", primaryKey: true },
    { name: "source", type: "TEXT", notNull: true },
    { name: "endpoint", type: "TEXT", notNull: true },
    { name: "request_hash", type: "TEXT", notNull: true },
    { name: "response_json", type: "TEXT", notNull: true },
    { name: "status_code", type: "INTEGER", notNull: true },
    { name: "etag", type: "TEXT" },
    { name: "last_modified", type: "TEXT" },
    { name: "fetched_at", type: "INTEGER", notNull: true },
    { name: "expires_at", type: "INTEGER" },
  ],
  indexes: [
    { name: "idx_http_cache_expires_at", columns: ["expires_at"] },
    { name: "idx_http_cache_source_endpoint", columns: ["source", "endpoint"] },
  ],
});

export const sqliteTableContracts = {
  schema_migrations: sqliteSchemaMigrationTable,
  jobs: sqliteJobTable,
  action_receipts: sqliteActionReceiptTable,
  conversations: sqliteConversationTable,
  chat_messages: sqliteChatMessageTable,
  instance_profiles: sqliteInstanceProfileTable,
  instance_facts: sqliteInstanceFactTable,
  market_instruments: sqliteMarketInstrumentTable,
  ohlcv_bars: sqliteOhlcvBarTable,
  market_snapshots: sqliteMarketSnapshotTable,
  http_cache: sqliteHttpCacheTable,
} as const;

export type SqliteTableName = keyof typeof sqliteTableContracts;
export type SqliteTableContracts = typeof sqliteTableContracts;
export type SqliteAnyTableContract = SqliteTableContracts[SqliteTableName];

export const sqliteSchemaMigrationRowSchema = sqliteSchemaMigrationTable.rowSchema;
export const sqliteJobRowSchema = sqliteJobTable.rowSchema;
export const sqliteActionReceiptRowSchema = sqliteActionReceiptTable.rowSchema;
export const sqliteConversationRowSchema = sqliteConversationTable.rowSchema;
export const sqliteChatMessageRowSchema = sqliteChatMessageTable.rowSchema;
export const sqliteInstanceProfileRowSchema = sqliteInstanceProfileTable.rowSchema;
export const sqliteInstanceFactRowSchema = sqliteInstanceFactTable.rowSchema;
export const sqliteMarketInstrumentRowSchema = sqliteMarketInstrumentTable.rowSchema;
export const sqliteOhlcvBarRowSchema = sqliteOhlcvBarTable.rowSchema;
export const sqliteMarketSnapshotRowSchema = sqliteMarketSnapshotTable.rowSchema;
export const sqliteHttpCacheRowSchema = sqliteHttpCacheTable.rowSchema;

export const sqliteTables = {
  schema_migrations: sqliteSchemaMigrationRowSchema,
  jobs: sqliteJobRowSchema,
  action_receipts: sqliteActionReceiptRowSchema,
  conversations: sqliteConversationRowSchema,
  chat_messages: sqliteChatMessageRowSchema,
  instance_profiles: sqliteInstanceProfileRowSchema,
  instance_facts: sqliteInstanceFactRowSchema,
  market_instruments: sqliteMarketInstrumentRowSchema,
  ohlcv_bars: sqliteOhlcvBarRowSchema,
  market_snapshots: sqliteMarketSnapshotRowSchema,
  http_cache: sqliteHttpCacheRowSchema,
} as const;

export const getSqliteTableContracts = (): readonly SqliteAnyTableContract[] => Object.values(sqliteTableContracts);
export const getSqliteTableContract = (tableName: SqliteTableName): SqliteAnyTableContract => sqliteTableContracts[tableName];

export type SqliteSchemaMigrationRow = z.infer<typeof sqliteSchemaMigrationRowSchema>;
export type SqliteJobRow = z.infer<typeof sqliteJobRowSchema>;
export type SqliteActionReceiptRow = z.infer<typeof sqliteActionReceiptRowSchema>;
export type SqliteConversationRow = z.infer<typeof sqliteConversationRowSchema>;
export type SqliteChatMessageRow = z.infer<typeof sqliteChatMessageRowSchema>;
export type SqliteInstanceProfileRow = z.infer<typeof sqliteInstanceProfileRowSchema>;
export type SqliteInstanceFactRow = z.infer<typeof sqliteInstanceFactRowSchema>;
export type SqliteMarketInstrumentRow = z.infer<typeof sqliteMarketInstrumentRowSchema>;
export type SqliteOhlcvBarRow = z.infer<typeof sqliteOhlcvBarRowSchema>;
export type SqliteMarketSnapshotRow = z.infer<typeof sqliteMarketSnapshotRowSchema>;
export type SqliteHttpCacheRow = z.infer<typeof sqliteHttpCacheRowSchema>;
