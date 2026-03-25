import { z } from "zod";

import {
  actionResultSchema,
  chatMessageMetadataSchema,
  chatMessageStateInputSchema,
  chatMessageStateSchema,
  chatMessageRoleSchema,
  confidenceSchema,
  conversationStateSchema,
  factIdSchema,
  factKeySchema,
  instanceFactStateSchema,
  instanceIdSchema,
  instanceProfileStateSchema,
  jobStateSchema,
  nonEmptyTrimmedStringSchema,
  nonNegativeIntegerSchema,
  positiveIntegerSchema,
  runtimeJobStatusSchema,
  unixMillisecondsSchema,
} from "../../contracts/persistence";

export {
  actionResultSchema,
  chatMessageMetadataSchema,
  chatMessageRoleSchema,
  chatMessageStateInputSchema,
  chatMessageStateSchema,
  conversationStateSchema,
  instanceFactStateSchema,
  instanceProfileStateSchema,
  jobStateSchema,
  runtimeJobStatusSchema,
};

export const sqliteStateStoreConfigSchema = z.object({
  path: nonEmptyTrimmedStringSchema,
  walMode: z.boolean(),
  busyTimeoutMs: nonNegativeIntegerSchema,
});

export const marketInstrumentInputSchema = z.object({
  chain: nonEmptyTrimmedStringSchema,
  address: nonEmptyTrimmedStringSchema,
  symbol: nonEmptyTrimmedStringSchema.optional(),
  name: nonEmptyTrimmedStringSchema.optional(),
  decimals: nonNegativeIntegerSchema.optional(),
});

export const ohlcvBarInputSchema = z.object({
  openTime: unixMillisecondsSchema,
  closeTime: unixMillisecondsSchema,
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().optional(),
  trades: nonNegativeIntegerSchema.optional(),
  vwap: z.number().optional(),
  raw: z.unknown().optional(),
  fetchedAt: unixMillisecondsSchema.optional(),
});

export const saveOhlcvBarsInputSchema = z.object({
  instrument: marketInstrumentInputSchema,
  source: nonEmptyTrimmedStringSchema,
  interval: nonEmptyTrimmedStringSchema,
  bars: z.array(ohlcvBarInputSchema).min(1),
});

export const ohlcvBarRecordSchema = z.object({
  chain: nonEmptyTrimmedStringSchema,
  address: nonEmptyTrimmedStringSchema,
  source: nonEmptyTrimmedStringSchema,
  interval: nonEmptyTrimmedStringSchema,
  openTime: unixMillisecondsSchema,
  closeTime: unixMillisecondsSchema,
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().optional(),
  trades: nonNegativeIntegerSchema.optional(),
  vwap: z.number().optional(),
  fetchedAt: unixMillisecondsSchema,
  raw: z.unknown().optional(),
});

export const marketSnapshotInputSchema = z.object({
  instrument: marketInstrumentInputSchema,
  source: nonEmptyTrimmedStringSchema,
  snapshotType: nonEmptyTrimmedStringSchema,
  data: z.unknown(),
  timestamp: unixMillisecondsSchema.optional(),
});

export const marketSnapshotRecordSchema = z.object({
  id: nonEmptyTrimmedStringSchema,
  chain: nonEmptyTrimmedStringSchema,
  address: nonEmptyTrimmedStringSchema,
  source: nonEmptyTrimmedStringSchema,
  snapshotType: nonEmptyTrimmedStringSchema,
  data: z.unknown(),
  timestamp: unixMillisecondsSchema,
});

export const httpCacheEntryInputSchema = z.object({
  cacheKey: nonEmptyTrimmedStringSchema,
  source: nonEmptyTrimmedStringSchema,
  endpoint: nonEmptyTrimmedStringSchema,
  requestHash: nonEmptyTrimmedStringSchema,
  response: z.unknown(),
  statusCode: z.number().int(),
  etag: nonEmptyTrimmedStringSchema.optional(),
  lastModified: nonEmptyTrimmedStringSchema.optional(),
  fetchedAt: unixMillisecondsSchema.optional(),
  expiresAt: unixMillisecondsSchema.optional(),
});

export const httpCacheEntryRecordSchema = z.object({
  cacheKey: nonEmptyTrimmedStringSchema,
  source: nonEmptyTrimmedStringSchema,
  endpoint: nonEmptyTrimmedStringSchema,
  requestHash: nonEmptyTrimmedStringSchema,
  response: z.unknown(),
  statusCode: z.number().int(),
  etag: nonEmptyTrimmedStringSchema.optional(),
  lastModified: nonEmptyTrimmedStringSchema.optional(),
  fetchedAt: unixMillisecondsSchema,
  expiresAt: unixMillisecondsSchema.optional(),
});

export const runtimeRetentionInputSchema = z.object({
  receiptsDays: z.number().int().positive(),
});

export const runtimeRetentionResultSchema = z.object({
  receiptsDeleted: z.number().int().nonnegative(),
  cacheDeleted: z.number().int().nonnegative(),
});

export type MarketInstrumentInput = z.infer<typeof marketInstrumentInputSchema>;
export type OhlcvBarInput = z.infer<typeof ohlcvBarInputSchema>;
export type SaveOhlcvBarsInput = z.infer<typeof saveOhlcvBarsInputSchema>;
export type OhlcvBarRecord = z.infer<typeof ohlcvBarRecordSchema>;
export type MarketSnapshotInput = z.infer<typeof marketSnapshotInputSchema>;
export type MarketSnapshotRecord = z.infer<typeof marketSnapshotRecordSchema>;
export type HttpCacheEntryInput = z.infer<typeof httpCacheEntryInputSchema>;
export type HttpCacheEntryRecord = z.infer<typeof httpCacheEntryRecordSchema>;
export type RuntimeRetentionInput = z.infer<typeof runtimeRetentionInputSchema>;
export type RuntimeRetentionResult = z.infer<typeof runtimeRetentionResultSchema>;
export type ConversationStateInput = z.infer<typeof conversationStateSchema>;
export type ChatMessageStateInput = z.infer<typeof chatMessageStateInputSchema>;
export type InstanceFactStateInput = z.infer<typeof instanceFactStateSchema>;
