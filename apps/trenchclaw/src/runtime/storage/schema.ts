import { z } from "zod";

import type { ActionResult } from "../../ai/runtime/types/action";
import type {
  ChatMessageState,
  ConversationState,
  InstanceFactState,
  InstanceProfileState,
  JobState,
} from "../../ai/runtime/types/state";
import { sqliteJobStatusSchema } from "./sqlite-schema";

export * from "./sqlite-schema";

const nonEmpty = z.string().trim().min(1);
const unixMs = z.number().int().nonnegative();
const optionalUnixMs = unixMs.optional();
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
  timestamp: unixMs,
  idempotencyKey: nonEmpty,
  decisionTrace: z.array(z.string()).optional(),
});

export const jobStateSchema: z.ZodType<JobState> = z.object({
  id: nonEmpty,
  botId: nonEmpty,
  routineName: nonEmpty,
  status: runtimeJobStatusSchema,
  config: jsonRecord,
  nextRunAt: optionalUnixMs,
  lastRunAt: optionalUnixMs,
  cyclesCompleted: z.number().int().nonnegative(),
  totalCycles: z.number().int().nonnegative().optional(),
  lastResult: actionResultSchema.optional(),
  attemptCount: z.number().int().nonnegative().optional(),
  leaseOwner: nonEmpty.optional(),
  leaseExpiresAt: optionalUnixMs,
  lastError: z.string().optional(),
  createdAt: unixMs,
  updatedAt: unixMs,
});

export const chatMessageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);

export const conversationStateSchema: z.ZodType<ConversationState> = z.object({
  id: nonEmpty,
  sessionId: nonEmpty.optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  createdAt: unixMs,
  updatedAt: unixMs,
});

export const chatMessageStateSchema: z.ZodType<ChatMessageState> = z.object({
  id: nonEmpty,
  conversationId: nonEmpty,
  role: chatMessageRoleSchema,
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: unixMs,
});

export const instanceProfileStateSchema: z.ZodType<InstanceProfileState> = z.object({
  instanceId: nonEmpty,
  displayName: z.string().optional(),
  summary: z.string().optional(),
  tradingStyle: z.string().optional(),
  riskTolerance: z.string().optional(),
  preferredAssets: z.array(nonEmpty).optional(),
  dislikedAssets: z.array(nonEmpty).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: unixMs,
  updatedAt: unixMs,
});

export const instanceFactStateSchema: z.ZodType<InstanceFactState> = z.object({
  id: nonEmpty,
  instanceId: nonEmpty,
  factKey: nonEmpty,
  factValue: z.unknown(),
  confidence: z.number().min(0).max(1),
  source: nonEmpty,
  sourceMessageId: nonEmpty.optional(),
  createdAt: unixMs,
  updatedAt: unixMs,
  expiresAt: unixMs.optional(),
});

export const sqliteStateStoreConfigSchema = z.object({
  path: nonEmpty,
  walMode: z.boolean(),
  busyTimeoutMs: z.number().int().nonnegative(),
});

export const marketInstrumentInputSchema = z.object({
  chain: nonEmpty,
  address: nonEmpty,
  symbol: nonEmpty.optional(),
  name: nonEmpty.optional(),
  decimals: z.number().int().nonnegative().optional(),
});

export const ohlcvBarInputSchema = z.object({
  openTime: unixMs,
  closeTime: unixMs,
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().optional(),
  trades: z.number().int().nonnegative().optional(),
  vwap: z.number().optional(),
  raw: z.unknown().optional(),
  fetchedAt: unixMs.optional(),
});

export const saveOhlcvBarsInputSchema = z.object({
  instrument: marketInstrumentInputSchema,
  source: nonEmpty,
  interval: nonEmpty,
  bars: z.array(ohlcvBarInputSchema).min(1),
});

export const ohlcvBarRecordSchema = z.object({
  chain: nonEmpty,
  address: nonEmpty,
  source: nonEmpty,
  interval: nonEmpty,
  openTime: unixMs,
  closeTime: unixMs,
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().optional(),
  trades: z.number().int().nonnegative().optional(),
  vwap: z.number().optional(),
  fetchedAt: unixMs,
  raw: z.unknown().optional(),
});

export const marketSnapshotInputSchema = z.object({
  instrument: marketInstrumentInputSchema,
  source: nonEmpty,
  snapshotType: nonEmpty,
  data: z.unknown(),
  timestamp: unixMs.optional(),
});

export const marketSnapshotRecordSchema = z.object({
  id: nonEmpty,
  chain: nonEmpty,
  address: nonEmpty,
  source: nonEmpty,
  snapshotType: nonEmpty,
  data: z.unknown(),
  timestamp: unixMs,
});

export const httpCacheEntryInputSchema = z.object({
  cacheKey: nonEmpty,
  source: nonEmpty,
  endpoint: nonEmpty,
  requestHash: nonEmpty,
  response: z.unknown(),
  statusCode: z.number().int(),
  etag: nonEmpty.optional(),
  lastModified: nonEmpty.optional(),
  fetchedAt: unixMs.optional(),
  expiresAt: unixMs.optional(),
});

export const httpCacheEntryRecordSchema = z.object({
  cacheKey: nonEmpty,
  source: nonEmpty,
  endpoint: nonEmpty,
  requestHash: nonEmpty,
  response: z.unknown(),
  statusCode: z.number().int(),
  etag: nonEmpty.optional(),
  lastModified: nonEmpty.optional(),
  fetchedAt: unixMs,
  expiresAt: unixMs.optional(),
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
