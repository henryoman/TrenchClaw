import { z } from "zod";

import type { ActionResult } from "../../ai/contracts/types/action";
import type {
  ChatMessageState,
  ConversationState,
  InstanceFactState,
  InstanceProfileState,
  JobState,
} from "../../ai/contracts/types/state";
import {
  botIdSchema,
  confidenceSchema,
  conversationIdSchema,
  factIdSchema,
  factKeySchema,
  idempotencyKeySchema,
  instanceIdSchema,
  jobIdSchema,
  nonEmptyTrimmedStringSchema,
  nonNegativeIntegerSchema,
  positiveIntegerSchema,
  sessionIdSchema,
  unixMillisecondsSchema,
} from "./schema-primitives";
import { sqliteJobStatusSchema } from "./sqlite-schema";

const optionalUnixMs = unixMillisecondsSchema.optional();
const jsonRecord = z.record(z.string(), z.unknown());

export const runtimeJobStatusSchema = sqliteJobStatusSchema;

export const actionResultSchema: z.ZodType<ActionResult> = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  code: z.string().optional(),
  retryable: z.boolean(),
  txSignature: z.string().optional(),
  durationMs: z.number().nonnegative(),
  timestamp: unixMillisecondsSchema,
  idempotencyKey: idempotencyKeySchema,
  decisionTrace: z.array(z.string()).optional(),
});

export const jobStateSchema: z.ZodType<JobState> = z.object({
  id: jobIdSchema,
  serialNumber: positiveIntegerSchema.optional(),
  botId: botIdSchema,
  routineName: nonEmptyTrimmedStringSchema,
  status: runtimeJobStatusSchema,
  config: jsonRecord,
  nextRunAt: optionalUnixMs,
  lastRunAt: optionalUnixMs,
  cyclesCompleted: nonNegativeIntegerSchema,
  totalCycles: nonNegativeIntegerSchema.optional(),
  lastResult: actionResultSchema.optional(),
  attemptCount: nonNegativeIntegerSchema.optional(),
  leaseOwner: nonEmptyTrimmedStringSchema.optional(),
  leaseExpiresAt: optionalUnixMs,
  lastError: z.string().optional(),
  createdAt: unixMillisecondsSchema,
  updatedAt: unixMillisecondsSchema,
});

export const chatMessageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);

export const conversationStateSchema: z.ZodType<ConversationState> = z.object({
  id: conversationIdSchema,
  sessionId: sessionIdSchema.optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  createdAt: unixMillisecondsSchema,
  updatedAt: unixMillisecondsSchema,
});

export const chatMessageStateSchema: z.ZodType<ChatMessageState> = z.object({
  id: nonEmptyTrimmedStringSchema,
  conversationId: conversationIdSchema,
  role: chatMessageRoleSchema,
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: unixMillisecondsSchema,
});

export const instanceProfileStateSchema: z.ZodType<InstanceProfileState> = z.object({
  instanceId: instanceIdSchema,
  displayName: z.string().optional(),
  summary: z.string().optional(),
  tradingStyle: z.string().optional(),
  riskTolerance: z.string().optional(),
  preferredAssets: z.array(nonEmptyTrimmedStringSchema).optional(),
  dislikedAssets: z.array(nonEmptyTrimmedStringSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: unixMillisecondsSchema,
  updatedAt: unixMillisecondsSchema,
});

export const instanceFactStateSchema: z.ZodType<InstanceFactState> = z.object({
  id: factIdSchema,
  instanceId: instanceIdSchema,
  factKey: factKeySchema,
  factValue: z.unknown(),
  confidence: confidenceSchema,
  source: nonEmptyTrimmedStringSchema,
  sourceMessageId: nonEmptyTrimmedStringSchema.optional(),
  createdAt: unixMillisecondsSchema,
  updatedAt: unixMillisecondsSchema,
  expiresAt: unixMillisecondsSchema.optional(),
});

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
export type ChatMessageStateInput = z.infer<typeof chatMessageStateSchema>;
export type InstanceFactStateInput = z.infer<typeof instanceFactStateSchema>;
