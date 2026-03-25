import { z } from "zod";

import type { ActionResult } from "../ai/contracts/types/action";
import type {
  BotId,
  ChatMessageId,
  ConversationId,
  FactId,
  FactKey,
  IdempotencyKey,
  InstanceId,
  JobId,
  SessionId,
} from "../ai/contracts/types/ids";

export const nonEmptyTrimmedStringSchema = z.string().trim().min(1);
export const unixMillisecondsSchema = z.number().int().nonnegative();
export const nonNegativeIntegerSchema = z.number().int().nonnegative();
export const positiveIntegerSchema = z.number().int().positive();
export const confidenceSchema = z.number().min(0).max(1);

export const jobIdSchema = nonEmptyTrimmedStringSchema;
export const botIdSchema = nonEmptyTrimmedStringSchema;
export const conversationIdSchema = nonEmptyTrimmedStringSchema;
export const chatMessageIdSchema = nonEmptyTrimmedStringSchema;
export const sessionIdSchema = nonEmptyTrimmedStringSchema;
export const instanceIdSchema = nonEmptyTrimmedStringSchema;
export const factIdSchema = nonEmptyTrimmedStringSchema;
export const factKeySchema = nonEmptyTrimmedStringSchema;
export const idempotencyKeySchema = nonEmptyTrimmedStringSchema;
export const chatMessageSequenceSchema = positiveIntegerSchema;

export const runtimeJobStatusSchema = z.enum(["pending", "running", "paused", "stopped", "failed"]);
export const chatMessageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);
export const runtimeSessionMessageRoleSchema = z.enum(["system", "user", "assistant", "toolResult"]);
export const runtimeSessionEntryTypeSchema = z.enum(["session", "message", "event"]);
export const runtimeSummaryCategorySchema = z.enum(["runtime", "trade", "data"]);
export const runtimeSummarySourceSchema = z.enum(["runtime", "queue", "chat", "system"]);

export type JobStatus = z.infer<typeof runtimeJobStatusSchema>;
export type ChatMessageRole = z.infer<typeof chatMessageRoleSchema>;
export type RuntimeSessionMessageRole = z.infer<typeof runtimeSessionMessageRoleSchema>;
export type RuntimeSessionEntryType = z.infer<typeof runtimeSessionEntryTypeSchema>;
export type RuntimeSummaryCategory = z.infer<typeof runtimeSummaryCategorySchema>;
export type RuntimeSummarySource = z.infer<typeof runtimeSummarySourceSchema>;

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

export const persistedUiTextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
}).passthrough();

export const persistedUiReasoningPartSchema = z.object({
  type: z.literal("reasoning"),
  text: z.string(),
}).passthrough();

export const persistedUiToolPartSchema = z.object({
  type: z.string().trim().min(1).regex(/^tool-/u),
  toolCallId: nonEmptyTrimmedStringSchema.optional(),
  state: nonEmptyTrimmedStringSchema.optional(),
  title: z.string().optional(),
  input: z.unknown().optional(),
  rawInput: z.unknown().optional(),
  output: z.unknown().optional(),
  errorText: z.string().optional(),
  providerExecuted: z.boolean().optional(),
  callProviderMetadata: z.unknown().optional(),
  resultProviderMetadata: z.unknown().optional(),
}).passthrough();

export const persistedUiGenericPartSchema = z.object({
  type: z.string().trim().min(1),
}).passthrough();

export const persistedUiMessagePartSchema = z.union([
  persistedUiTextPartSchema,
  persistedUiReasoningPartSchema,
  persistedUiToolPartSchema,
  persistedUiGenericPartSchema,
]);

export const persistedUiMessagePartsSchema = z.array(persistedUiMessagePartSchema).min(1);

export const chatMessageMetadataSchema = z.object({
  source: nonEmptyTrimmedStringSchema.optional(),
  kind: nonEmptyTrimmedStringSchema.optional(),
  title: z.string().trim().min(1).optional(),
}).passthrough();

export interface ConversationState {
  id: ConversationId;
  sessionId?: SessionId;
  title?: string;
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessageState {
  id: ChatMessageId;
  conversationId: ConversationId;
  sequence: number;
  role: ChatMessageRole;
  content: string;
  parts: PersistedUiMessagePart[];
  metadata?: ChatMessageMetadata;
  createdAt: number;
}

export interface ChatMessageStateInput {
  id: ChatMessageId;
  conversationId: ConversationId;
  sequence?: number;
  role: ChatMessageRole;
  content: string;
  parts?: PersistedUiMessagePart[];
  metadata?: ChatMessageMetadata;
  createdAt: number;
}

export interface JobState {
  id: JobId;
  serialNumber?: number;
  botId: BotId;
  routineName: string;
  status: JobStatus;
  config: Record<string, unknown>;
  nextRunAt?: number;
  lastRunAt?: number;
  cyclesCompleted: number;
  totalCycles?: number;
  lastResult?: ActionResult;
  attemptCount?: number;
  leaseOwner?: string;
  leaseExpiresAt?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface InstanceProfileState {
  instanceId: InstanceId;
  displayName?: string;
  summary?: string;
  tradingStyle?: string;
  riskTolerance?: string;
  preferredAssets?: string[];
  dislikedAssets?: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface InstanceFactState {
  id: FactId;
  instanceId: InstanceId;
  factKey: FactKey;
  factValue: unknown;
  confidence: number;
  source: string;
  sourceMessageId?: ChatMessageId;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

export interface RuntimeSessionState {
  sessionId: SessionId;
  sessionKey: string;
  agentId: string;
  source: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  eventCount: number;
  endedAt?: number;
}

export interface RuntimeSessionMessageEntry {
  sessionId: SessionId;
  sequence: number;
  timestamp: number;
  role: RuntimeSessionMessageRole;
  text: string;
  usage?: {
    cost?: {
      total?: number;
    };
  };
}

export interface RuntimeSessionEventEntry {
  sessionId: SessionId;
  sequence: number;
  timestamp: number;
  eventType: string;
  payload: unknown;
}

export interface RuntimeSessionSummaryRecord {
  sessionId: SessionId;
  sessionKey: string;
  source: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  eventCount: number;
  profile: "safe" | "dangerous" | "veryDangerous";
  schedulerTickMs: number;
  registeredActions: string[];
  pendingJobsAtStop: number;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  compactionLevel: "basic";
}

export interface RuntimeSummaryEntry {
  timestamp: number;
  source: RuntimeSummarySource;
  category: RuntimeSummaryCategory;
  event: string;
  details?: Record<string, unknown>;
}

export type PersistedUiMessagePart = z.infer<typeof persistedUiMessagePartSchema>;
export type ChatMessageMetadata = z.infer<typeof chatMessageMetadataSchema>;

export const conversationStateSchema: z.ZodType<ConversationState> = z.object({
  id: conversationIdSchema,
  sessionId: sessionIdSchema.optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  createdAt: unixMillisecondsSchema,
  updatedAt: unixMillisecondsSchema,
});

export const chatMessageStateSchema: z.ZodType<ChatMessageState> = z.object({
  id: chatMessageIdSchema,
  conversationId: conversationIdSchema,
  sequence: chatMessageSequenceSchema,
  role: chatMessageRoleSchema,
  content: z.string(),
  parts: persistedUiMessagePartsSchema,
  metadata: chatMessageMetadataSchema.optional(),
  createdAt: unixMillisecondsSchema,
});

export const chatMessageStateInputSchema: z.ZodType<ChatMessageStateInput> = z.object({
  id: chatMessageIdSchema,
  conversationId: conversationIdSchema,
  sequence: chatMessageSequenceSchema.optional(),
  role: chatMessageRoleSchema,
  content: z.string(),
  parts: persistedUiMessagePartsSchema.optional(),
  metadata: chatMessageMetadataSchema.optional(),
  createdAt: unixMillisecondsSchema,
});

export const jobStateSchema: z.ZodType<JobState> = z.object({
  id: jobIdSchema,
  serialNumber: positiveIntegerSchema.optional(),
  botId: botIdSchema,
  routineName: nonEmptyTrimmedStringSchema,
  status: runtimeJobStatusSchema,
  config: z.record(z.string(), z.unknown()),
  nextRunAt: unixMillisecondsSchema.optional(),
  lastRunAt: unixMillisecondsSchema.optional(),
  cyclesCompleted: nonNegativeIntegerSchema,
  totalCycles: nonNegativeIntegerSchema.optional(),
  lastResult: actionResultSchema.optional(),
  attemptCount: nonNegativeIntegerSchema.optional(),
  leaseOwner: nonEmptyTrimmedStringSchema.optional(),
  leaseExpiresAt: unixMillisecondsSchema.optional(),
  lastError: z.string().optional(),
  createdAt: unixMillisecondsSchema,
  updatedAt: unixMillisecondsSchema,
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
  sourceMessageId: chatMessageIdSchema.optional(),
  createdAt: unixMillisecondsSchema,
  updatedAt: unixMillisecondsSchema,
  expiresAt: unixMillisecondsSchema.optional(),
});

export const runtimeSessionStateSchema: z.ZodType<RuntimeSessionState> = z.object({
  sessionId: sessionIdSchema,
  sessionKey: nonEmptyTrimmedStringSchema,
  agentId: nonEmptyTrimmedStringSchema,
  source: nonEmptyTrimmedStringSchema,
  createdAt: unixMillisecondsSchema,
  updatedAt: unixMillisecondsSchema,
  messageCount: nonNegativeIntegerSchema,
  eventCount: nonNegativeIntegerSchema,
  endedAt: unixMillisecondsSchema.optional(),
});

export const runtimeSessionMessageEntrySchema: z.ZodType<RuntimeSessionMessageEntry> = z.object({
  sessionId: sessionIdSchema,
  sequence: chatMessageSequenceSchema,
  timestamp: unixMillisecondsSchema,
  role: runtimeSessionMessageRoleSchema,
  text: z.string(),
  usage: z.object({
    cost: z.object({
      total: z.number().optional(),
    }).optional(),
  }).optional(),
});

export const runtimeSessionEventEntrySchema: z.ZodType<RuntimeSessionEventEntry> = z.object({
  sessionId: sessionIdSchema,
  sequence: chatMessageSequenceSchema,
  timestamp: unixMillisecondsSchema,
  eventType: nonEmptyTrimmedStringSchema,
  payload: z.unknown(),
});

export const runtimeSessionSummaryRecordSchema: z.ZodType<RuntimeSessionSummaryRecord> = z.object({
  sessionId: sessionIdSchema,
  sessionKey: nonEmptyTrimmedStringSchema,
  source: nonEmptyTrimmedStringSchema,
  createdAt: unixMillisecondsSchema,
  updatedAt: unixMillisecondsSchema,
  messageCount: nonNegativeIntegerSchema,
  eventCount: nonNegativeIntegerSchema,
  profile: z.enum(["safe", "dangerous", "veryDangerous"]),
  schedulerTickMs: nonNegativeIntegerSchema,
  registeredActions: z.array(nonEmptyTrimmedStringSchema),
  pendingJobsAtStop: nonNegativeIntegerSchema,
  startedAt: unixMillisecondsSchema,
  endedAt: unixMillisecondsSchema,
  durationSec: nonNegativeIntegerSchema,
  compactionLevel: z.literal("basic"),
});

export const runtimeSummaryEntrySchema: z.ZodType<RuntimeSummaryEntry> = z.object({
  timestamp: unixMillisecondsSchema,
  source: runtimeSummarySourceSchema,
  category: runtimeSummaryCategorySchema,
  event: nonEmptyTrimmedStringSchema,
  details: z.record(z.string(), z.unknown()).optional(),
});
