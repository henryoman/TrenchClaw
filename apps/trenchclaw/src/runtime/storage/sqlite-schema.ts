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

export const sqliteJobStatusSchema = z.enum(["pending", "running", "paused", "stopped", "failed"]);
export const sqliteChatRoleSchema = z.enum(["system", "user", "assistant", "tool"]);

export const sqliteSchemaMigrationRowSchema = z.object({
  version: z.number().int(),
  applied_at: unixMillisecondsSchema,
});

export const sqliteJobRowSchema = z.object({
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
});

export const sqliteActionReceiptRowSchema = z.object({
  idempotency_key: idempotencyKeySchema,
  payload_json: z.string(),
  timestamp: unixMillisecondsSchema,
});

export const sqliteConversationRowSchema = z.object({
  id: conversationIdSchema,
  session_id: sessionIdSchema.nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  created_at: unixMillisecondsSchema,
  updated_at: unixMillisecondsSchema,
});

export const sqliteChatMessageRowSchema = z.object({
  id: chatMessageIdSchema,
  conversation_id: conversationIdSchema,
  role: sqliteChatRoleSchema,
  content: z.string(),
  metadata_json: z.string().nullable(),
  created_at: unixMillisecondsSchema,
});

export const sqliteInstanceProfileRowSchema = z.object({
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
});

export const sqliteInstanceFactRowSchema = z.object({
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
});

export const sqliteMarketInstrumentRowSchema = z.object({
  id: nonNegativeIntegerSchema,
  chain: nonEmptyTrimmedStringSchema,
  address: nonEmptyTrimmedStringSchema,
  symbol: z.string().nullable(),
  name: z.string().nullable(),
  decimals: nonNegativeIntegerSchema.nullable(),
  created_at: unixMillisecondsSchema,
  updated_at: unixMillisecondsSchema,
});

export const sqliteOhlcvBarRowSchema = z.object({
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
});

export const sqliteMarketSnapshotRowSchema = z.object({
  id: nonEmptyTrimmedStringSchema,
  instrument_id: nonNegativeIntegerSchema,
  source: nonEmptyTrimmedStringSchema,
  snapshot_type: nonEmptyTrimmedStringSchema,
  data_json: z.string(),
  timestamp: unixMillisecondsSchema,
});

export const sqliteHttpCacheRowSchema = z.object({
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
});

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
