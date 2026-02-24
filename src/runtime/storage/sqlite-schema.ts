import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const unixMs = z.number().int().nonnegative();
const nonNegativeInt = z.number().int().nonnegative();

export const sqliteJobStatusSchema = z.enum(["pending", "running", "paused", "stopped", "failed"]);
export const sqliteChatRoleSchema = z.enum(["system", "user", "assistant", "tool"]);

export const sqliteSchemaMigrationRowSchema = z.object({
  version: z.number().int(),
  applied_at: unixMs,
});

export const sqliteJobRowSchema = z.object({
  id: nonEmpty,
  bot_id: nonEmpty,
  routine_name: nonEmpty,
  status: sqliteJobStatusSchema,
  config_json: z.string(),
  next_run_at: nonNegativeInt.nullable(),
  last_run_at: nonNegativeInt.nullable(),
  cycles_completed: nonNegativeInt,
  total_cycles: nonNegativeInt.nullable(),
  last_result_json: z.string().nullable(),
  created_at: unixMs,
  updated_at: unixMs,
});

export const sqliteActionReceiptRowSchema = z.object({
  idempotency_key: nonEmpty,
  payload_json: z.string(),
  timestamp: unixMs,
});

export const sqlitePolicyHitRowSchema = z.object({
  id: nonEmpty,
  action_name: nonEmpty,
  result_json: z.string(),
  created_at: unixMs,
});

export const sqliteDecisionLogRowSchema = z.object({
  id: nonEmpty,
  job_id: nonEmpty.nullable(),
  action_name: nonEmpty,
  trace_json: z.string(),
  created_at: unixMs,
});

export const sqliteConversationRowSchema = z.object({
  id: nonEmpty,
  session_id: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  created_at: unixMs,
  updated_at: unixMs,
});

export const sqliteChatMessageRowSchema = z.object({
  id: nonEmpty,
  conversation_id: nonEmpty,
  role: sqliteChatRoleSchema,
  content: z.string(),
  metadata_json: z.string().nullable(),
  created_at: unixMs,
});

export const sqliteMarketInstrumentRowSchema = z.object({
  id: nonNegativeInt,
  chain: nonEmpty,
  address: nonEmpty,
  symbol: z.string().nullable(),
  name: z.string().nullable(),
  decimals: nonNegativeInt.nullable(),
  created_at: unixMs,
  updated_at: unixMs,
});

export const sqliteOhlcvBarRowSchema = z.object({
  instrument_id: nonNegativeInt,
  source: nonEmpty,
  interval: nonEmpty,
  open_time: unixMs,
  close_time: unixMs,
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nullable(),
  trades: z.number().int().nullable(),
  vwap: z.number().nullable(),
  fetched_at: unixMs,
  raw_json: z.string().nullable(),
});

export const sqliteMarketSnapshotRowSchema = z.object({
  id: nonEmpty,
  instrument_id: nonNegativeInt,
  source: nonEmpty,
  snapshot_type: nonEmpty,
  data_json: z.string(),
  timestamp: unixMs,
});

export const sqliteHttpCacheRowSchema = z.object({
  cache_key: nonEmpty,
  source: nonEmpty,
  endpoint: nonEmpty,
  request_hash: nonEmpty,
  response_json: z.string(),
  status_code: z.number().int(),
  etag: z.string().nullable(),
  last_modified: z.string().nullable(),
  fetched_at: unixMs,
  expires_at: nonNegativeInt.nullable(),
});

export const sqliteTables = {
  schema_migrations: sqliteSchemaMigrationRowSchema,
  jobs: sqliteJobRowSchema,
  action_receipts: sqliteActionReceiptRowSchema,
  policy_hits: sqlitePolicyHitRowSchema,
  decision_logs: sqliteDecisionLogRowSchema,
  conversations: sqliteConversationRowSchema,
  chat_messages: sqliteChatMessageRowSchema,
  market_instruments: sqliteMarketInstrumentRowSchema,
  ohlcv_bars: sqliteOhlcvBarRowSchema,
  market_snapshots: sqliteMarketSnapshotRowSchema,
  http_cache: sqliteHttpCacheRowSchema,
} as const;

export type SqliteSchemaMigrationRow = z.infer<typeof sqliteSchemaMigrationRowSchema>;
export type SqliteJobRow = z.infer<typeof sqliteJobRowSchema>;
export type SqliteActionReceiptRow = z.infer<typeof sqliteActionReceiptRowSchema>;
export type SqlitePolicyHitRow = z.infer<typeof sqlitePolicyHitRowSchema>;
export type SqliteDecisionLogRow = z.infer<typeof sqliteDecisionLogRowSchema>;
export type SqliteConversationRow = z.infer<typeof sqliteConversationRowSchema>;
export type SqliteChatMessageRow = z.infer<typeof sqliteChatMessageRowSchema>;
export type SqliteMarketInstrumentRow = z.infer<typeof sqliteMarketInstrumentRowSchema>;
export type SqliteOhlcvBarRow = z.infer<typeof sqliteOhlcvBarRowSchema>;
export type SqliteMarketSnapshotRow = z.infer<typeof sqliteMarketSnapshotRowSchema>;
export type SqliteHttpCacheRow = z.infer<typeof sqliteHttpCacheRowSchema>;
