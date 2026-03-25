import { Database } from "bun:sqlite";

import type { ActionResult } from "../../ai/contracts/types/action";
import type {
  ChatMessageState,
  ChatMessageStateInput,
  ConversationHistorySlice,
  ConversationState,
  InstanceFactState,
  InstanceProfileState,
  JobState,
  JobStatus,
  RuntimeKnowledgeSurface,
  RuntimeSearchResult,
  RuntimeSearchScope,
  StateStore,
} from "../../ai/contracts/types/state";
import {
  chatMessageMetadataSchema,
  persistedUiMessagePartsSchema,
  runtimeSessionStateSchema,
  runtimeSessionSummaryRecordSchema,
  type RuntimeSessionMessageRole,
  type RuntimeSessionState,
  type RuntimeSessionSummaryRecord,
  type ChatMessageMetadata,
  type PersistedUiMessagePart,
} from "../../contracts/persistence";
import {
  MAX_CONVERSATION_HISTORY_SCAN_MESSAGES,
  createConversationHistorySlice,
} from "../chat/history";
import {
  actionResultSchema,
  chatMessageStateInputSchema,
  chatMessageStateSchema,
  conversationStateSchema,
  instanceFactStateSchema,
  instanceProfileStateSchema,
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
import { initializeStorageFilePath } from "./log-files";
import {
  sqliteChatMessageRowSchema,
  sqliteConversationRowSchema,
  sqliteInstanceFactRowSchema,
  sqliteInstanceProfileRowSchema,
  sqliteJobRowSchema,
  sqliteRuntimeSessionRowSchema,
} from "./sqlite-schema";

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

const buildTextOnlyChatParts = (content: string): PersistedUiMessagePart[] => [
  {
    type: "text",
    text: content,
  },
];

const normalizeStoredChatMetadata = (metadataJson: string | null): {
  metadata: ChatMessageMetadata | undefined;
  serializedMetadata: string | null;
  legacyUiParts: PersistedUiMessagePart[] | null;
} => {
  if (metadataJson == null) {
    return {
      metadata: undefined,
      serializedMetadata: null,
      legacyUiParts: null,
    };
  }

  const parsed = parseJson<unknown>(metadataJson, null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      metadata: undefined,
      serializedMetadata: null,
      legacyUiParts: null,
    };
  }

  const metadataRecord = { ...(parsed as Record<string, unknown>) };
  const legacyUiParts = Array.isArray(metadataRecord.uiParts)
    ? parseJsonWithSchema(JSON.stringify(metadataRecord.uiParts), persistedUiMessagePartsSchema, null)
    : null;
  delete metadataRecord.uiParts;

  if (Object.keys(metadataRecord).length === 0) {
    return {
      metadata: undefined,
      serializedMetadata: null,
      legacyUiParts,
    };
  }

  const metadataResult = chatMessageMetadataSchema.safeParse(metadataRecord);
  if (!metadataResult.success) {
    return {
      metadata: undefined,
      serializedMetadata: null,
      legacyUiParts,
    };
  }

  return {
    metadata: metadataResult.data,
    serializedMetadata: JSON.stringify(metadataResult.data),
    legacyUiParts,
  };
};

const normalizeStoredChatParts = (input: {
  content: string;
  partsJson: string | null;
  metadataJson: string | null;
}): {
  parts: PersistedUiMessagePart[];
  serializedParts: string;
  metadata: ChatMessageMetadata | undefined;
  serializedMetadata: string | null;
} => {
  const metadata = normalizeStoredChatMetadata(input.metadataJson);
  const parsedParts =
    input.partsJson == null
      ? null
      : parseJsonWithSchema(input.partsJson, persistedUiMessagePartsSchema, null);
  const parts = parsedParts ?? metadata.legacyUiParts ?? buildTextOnlyChatParts(input.content);

  return {
    parts,
    serializedParts: JSON.stringify(parts),
    metadata: metadata.metadata,
    serializedMetadata: metadata.serializedMetadata,
  };
};

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
  private nextJobSerialNumber: number;

  constructor(config: SqliteStateStoreConfig) {
    this.config = sqliteStateStoreConfigSchema.parse(config);
    const absolutePath = initializeStorageFilePath(this.config.path, "initialize sqlite runtime store");
    this.db = new Database(absolutePath, { create: true, strict: true });

    this.configureConnection();
    this.schemaSyncReport = syncSqliteSchema(this.db);
    this.repairChatMessageStorage();
    this.nextJobSerialNumber = this.readNextJobSerialNumber();
  }

  private repairChatMessageStorage(): void {
    const rows = this.db
      .query(
        `
        SELECT id, conversation_id, sequence, role, content, parts_json, metadata_json, created_at
        FROM chat_messages
        ORDER BY conversation_id ASC, created_at ASC, id ASC
      `,
      )
      .all() as Record<string, unknown>[];

    let currentConversationId: string | null = null;
    let nextSequence = 0;
    for (const row of rows) {
      const parsed = sqliteChatMessageRowSchema.parse(row);
      if (parsed.conversation_id !== currentConversationId) {
        currentConversationId = parsed.conversation_id;
        nextSequence = 1;
      } else {
        nextSequence += 1;
      }

      const normalized = normalizeStoredChatParts({
        content: parsed.content,
        partsJson: parsed.parts_json,
        metadataJson: parsed.metadata_json,
      });
      if (
        parsed.sequence === nextSequence
        && parsed.parts_json === normalized.serializedParts
        && (parsed.metadata_json ?? null) === normalized.serializedMetadata
      ) {
        continue;
      }

      this.db
        .query(
          `
          UPDATE chat_messages
          SET
            sequence = ?,
            parts_json = ?,
            metadata_json = ?
          WHERE id = ?
        `,
        )
        .run(nextSequence, normalized.serializedParts, normalized.serializedMetadata, parsed.id);
    }
  }

  private resolveChatMessageSequence(input: {
    conversationId: string;
    messageId: string;
    requestedSequence?: number;
  }): number {
    if (typeof input.requestedSequence === "number" && Number.isFinite(input.requestedSequence)) {
      return Math.max(1, Math.trunc(input.requestedSequence));
    }

    const existing = this.db
      .query(
        `
        SELECT sequence
        FROM chat_messages
        WHERE id = ?
        LIMIT 1
      `,
      )
      .get(input.messageId) as { sequence?: number } | null;
    if (typeof existing?.sequence === "number" && Number.isFinite(existing.sequence) && existing.sequence > 0) {
      return Math.trunc(existing.sequence);
    }

    const maxRow = this.db
      .query(
        `
        SELECT MAX(sequence) AS max_sequence
        FROM chat_messages
        WHERE conversation_id = ?
      `,
      )
      .get(input.conversationId) as { max_sequence?: number | null } | null;
    const nextSequence = Math.trunc(Number(maxRow?.max_sequence ?? 0)) + 1;
    return Math.max(1, nextSequence);
  }

  private getNextRuntimeSessionEntrySequence(sessionId: string): number {
    const row = this.db
      .query(
        `
        SELECT MAX(sequence) AS max_sequence
        FROM runtime_session_entries
        WHERE session_id = ?
      `,
      )
      .get(sessionId) as { max_sequence?: number | null } | null;
    return Math.max(1, Math.trunc(Number(row?.max_sequence ?? 0)) + 1);
  }

  private appendRuntimeSessionMarker(input: {
    sessionId: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  }): void {
    this.db
      .query(
        `
        INSERT INTO runtime_session_entries (
          session_id, sequence, entry_type, timestamp, role, event_type, text_content, usage_json, payload_json, metadata_json
        )
        VALUES (?, ?, 'session', ?, NULL, NULL, NULL, NULL, NULL, ?)
      `,
      )
      .run(
        input.sessionId,
        this.getNextRuntimeSessionEntrySequence(input.sessionId),
        input.timestamp,
        input.metadata === undefined ? null : JSON.stringify(input.metadata),
      );
  }

  private getRuntimeSessionRow(sessionId: string): RuntimeSessionState | null {
    const row = this.db
      .query(
        `
        SELECT session_id, session_key, agent_id, source, created_at, updated_at, message_count, event_count, ended_at
        FROM runtime_sessions
        WHERE session_id = ?
        LIMIT 1
      `,
      )
      .get(sessionId) as Record<string, unknown> | null;
    if (!row) {
      return null;
    }

    const parsed = sqliteRuntimeSessionRowSchema.parse(row);
    return runtimeSessionStateSchema.parse({
      sessionId: parsed.session_id,
      sessionKey: parsed.session_key,
      agentId: parsed.agent_id,
      source: parsed.source,
      createdAt: parsed.created_at,
      updatedAt: parsed.updated_at,
      messageCount: parsed.message_count,
      eventCount: parsed.event_count,
      endedAt: parsed.ended_at ?? undefined,
    });
  }

  openRuntimeSession(input: {
    agentId: string;
    sessionKey: string;
    source: string;
    reuseSessionOnBoot?: boolean;
  }): RuntimeSessionState {
    const agentId = input.agentId.trim() || "main";
    const sessionKey = input.sessionKey.trim() || `agent:${agentId}:main`;
    const source = input.source.trim() || "cli";
    const reuseSessionOnBoot = input.reuseSessionOnBoot ?? true;
    const now = Date.now();
    const existing = this.db
      .query(
        `
        SELECT session_id, session_key, agent_id, source, created_at, updated_at, message_count, event_count, ended_at
        FROM runtime_sessions
        WHERE session_key = ?
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `,
      )
      .get(sessionKey) as Record<string, unknown> | null;

    if (reuseSessionOnBoot && existing) {
      const parsed = sqliteRuntimeSessionRowSchema.parse(existing);
      this.db
        .query(
          `
          UPDATE runtime_sessions
          SET updated_at = ?, ended_at = NULL
          WHERE session_id = ?
        `,
        )
        .run(now, parsed.session_id);
      this.appendRuntimeSessionMarker({
        sessionId: parsed.session_id,
        timestamp: now,
        metadata: {
          agentId,
          resumed: true,
        },
      });
      return this.getRuntimeSessionRow(parsed.session_id)
        ?? runtimeSessionStateSchema.parse({
          sessionId: parsed.session_id,
          sessionKey: parsed.session_key,
          agentId: parsed.agent_id,
          source: parsed.source,
          createdAt: parsed.created_at,
          updatedAt: now,
          messageCount: parsed.message_count,
          eventCount: parsed.event_count,
          endedAt: undefined,
        });
    }

    const sessionId = crypto.randomUUID();
    this.db
      .query(
        `
        INSERT INTO runtime_sessions (
          session_id, session_key, agent_id, source, created_at, updated_at, message_count, event_count, ended_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL)
      `,
      )
      .run(sessionId, sessionKey, agentId, source, now, now);
    this.appendRuntimeSessionMarker({
      sessionId,
      timestamp: now,
      metadata: {
        agentId,
      },
    });
    return this.getRuntimeSessionRow(sessionId)
      ?? runtimeSessionStateSchema.parse({
        sessionId,
        sessionKey,
        agentId,
        source,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        eventCount: 0,
      });
  }

  appendRuntimeSessionMessage(input: {
    sessionId: string;
    role: RuntimeSessionMessageRole;
    text: string;
    usage?: {
      cost?: {
        total?: number;
      };
    };
  }): void {
    const timestamp = Date.now();
    this.db
      .query(
        `
        INSERT INTO runtime_session_entries (
          session_id, sequence, entry_type, timestamp, role, event_type, text_content, usage_json, payload_json, metadata_json
        )
        VALUES (?, ?, 'message', ?, ?, NULL, ?, ?, NULL, NULL)
      `,
      )
      .run(
        input.sessionId,
        this.getNextRuntimeSessionEntrySequence(input.sessionId),
        timestamp,
        input.role,
        input.text,
        input.usage === undefined ? null : JSON.stringify(input.usage),
      );
    this.db
      .query(
        `
        UPDATE runtime_sessions
        SET
          updated_at = ?,
          message_count = message_count + 1,
          ended_at = NULL
        WHERE session_id = ?
      `,
      )
      .run(timestamp, input.sessionId);
  }

  appendRuntimeSessionEvent(input: {
    sessionId: string;
    eventType: string;
    payload: unknown;
  }): void {
    const timestamp = Date.now();
    this.db
      .query(
        `
        INSERT INTO runtime_session_entries (
          session_id, sequence, entry_type, timestamp, role, event_type, text_content, usage_json, payload_json, metadata_json
        )
        VALUES (?, ?, 'event', ?, NULL, ?, NULL, NULL, ?, NULL)
      `,
      )
      .run(
        input.sessionId,
        this.getNextRuntimeSessionEntrySequence(input.sessionId),
        timestamp,
        input.eventType,
        JSON.stringify(input.payload),
      );
    this.db
      .query(
        `
        UPDATE runtime_sessions
        SET
          updated_at = ?,
          event_count = event_count + 1,
          ended_at = NULL
        WHERE session_id = ?
      `,
      )
      .run(timestamp, input.sessionId);
  }

  getRuntimeSessionStats(sessionId: string): RuntimeSessionState | null {
    return this.getRuntimeSessionRow(sessionId);
  }

  endRuntimeSession(sessionId: string): void {
    const timestamp = Date.now();
    this.db
      .query(
        `
        UPDATE runtime_sessions
        SET
          updated_at = ?,
          ended_at = ?
        WHERE session_id = ?
      `,
      )
      .run(timestamp, timestamp, sessionId);
  }

  saveRuntimeSessionSummary(summary: RuntimeSessionSummaryRecord): void {
    const parsed = runtimeSessionSummaryRecordSchema.parse(summary);
    this.db
      .query(
        `
        INSERT INTO runtime_session_summaries (
          session_id, session_key, source, created_at, updated_at, message_count, event_count,
          profile, scheduler_tick_ms, registered_actions_json, pending_jobs_at_stop,
          started_at, ended_at, duration_sec, compaction_level
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          session_key = excluded.session_key,
          source = excluded.source,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          message_count = excluded.message_count,
          event_count = excluded.event_count,
          profile = excluded.profile,
          scheduler_tick_ms = excluded.scheduler_tick_ms,
          registered_actions_json = excluded.registered_actions_json,
          pending_jobs_at_stop = excluded.pending_jobs_at_stop,
          started_at = excluded.started_at,
          ended_at = excluded.ended_at,
          duration_sec = excluded.duration_sec,
          compaction_level = excluded.compaction_level
      `,
      )
      .run(
        parsed.sessionId,
        parsed.sessionKey,
        parsed.source,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.messageCount,
        parsed.eventCount,
        parsed.profile,
        parsed.schedulerTickMs,
        JSON.stringify(parsed.registeredActions),
        parsed.pendingJobsAtStop,
        parsed.startedAt,
        parsed.endedAt,
        parsed.durationSec,
        parsed.compactionLevel,
      );
  }

  recoverInterruptedJobs(now = Date.now()): number {
    const recovered = this.db
      .query(
        `
        UPDATE jobs
        SET
          status = 'pending',
          next_run_at = COALESCE(next_run_at, ?),
          lease_owner = NULL,
          lease_expires_at = NULL,
          updated_at = ?
        WHERE status = 'running'
      `,
      )
      .run(now, now);
    return Number(recovered.changes ?? 0);
  }

  saveJob(job: JobState): void {
    const parsedJob = jobStateSchema.parse({
      ...job,
      serialNumber: job.serialNumber ?? this.reserveJobSerialNumber(),
    });
    const statement = this.db.query(`
      INSERT INTO jobs (
        id, serial_number, bot_id, routine_name, status, config_json, next_run_at, last_run_at, cycles_completed,
        total_cycles, last_result_json, attempt_count, lease_owner, lease_expires_at, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        serial_number = excluded.serial_number,
        bot_id = excluded.bot_id,
        routine_name = excluded.routine_name,
        status = excluded.status,
        config_json = excluded.config_json,
        next_run_at = excluded.next_run_at,
        last_run_at = excluded.last_run_at,
        cycles_completed = excluded.cycles_completed,
        total_cycles = excluded.total_cycles,
        last_result_json = excluded.last_result_json,
        attempt_count = excluded.attempt_count,
        lease_owner = excluded.lease_owner,
        lease_expires_at = excluded.lease_expires_at,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
    `);

    statement.run(
      parsedJob.id,
      parsedJob.serialNumber ?? null,
      parsedJob.botId,
      parsedJob.routineName,
      parsedJob.status,
      JSON.stringify(parsedJob.config),
      parsedJob.nextRunAt ?? null,
      parsedJob.lastRunAt ?? null,
      parsedJob.cyclesCompleted,
      parsedJob.totalCycles ?? null,
      parsedJob.lastResult ? JSON.stringify(parsedJob.lastResult) : null,
      parsedJob.attemptCount ?? 0,
      parsedJob.leaseOwner ?? null,
      parsedJob.leaseExpiresAt ?? null,
      parsedJob.lastError ?? null,
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

  getJobBySerialNumber(serialNumber: number): JobState | null {
    const row = this.db
      .query(
        `
        SELECT *
        FROM jobs
        WHERE serial_number = ?
        LIMIT 1
      `,
      )
      .get(Math.max(1, Math.trunc(serialNumber))) as Record<string, unknown> | null;

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

  reserveJobSerialNumber(): number {
    const serialNumber = this.nextJobSerialNumber;
    this.nextJobSerialNumber += 1;
    return serialNumber;
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
      attemptCount:
        meta.attemptCount ??
        (status === "running" ? Math.max(0, Math.trunc((current.attemptCount ?? 0) + 1)) : current.attemptCount),
      leaseOwner: status === "running" ? meta.leaseOwner ?? "local-runtime" : undefined,
      leaseExpiresAt: status === "running" ? meta.leaseExpiresAt : undefined,
      lastError: meta.lastError ?? (status === "running" ? undefined : current.lastError),
      updatedAt: Date.now(),
    };
    this.saveJob(next);
  }

  tryStartJob(input: {
    id: string;
    expectedCycle: number;
    leaseOwner?: string;
    leaseExpiresAt?: number;
  }): JobState | null {
    const now = Date.now();
    const info = this.db
      .query(
        `
        UPDATE jobs
        SET
          status = 'running',
          attempt_count = COALESCE(attempt_count, 0) + 1,
          lease_owner = ?,
          lease_expires_at = ?,
          last_error = NULL,
          updated_at = ?
        WHERE id = ?
          AND status = 'pending'
          AND cycles_completed = ?
      `,
      )
      .run(
        input.leaseOwner ?? "local-runtime",
        input.leaseExpiresAt ?? null,
        now,
        input.id,
        Math.max(0, Math.trunc(input.expectedCycle - 1)),
      );

    if (Number(info.changes ?? 0) === 0) {
      return null;
    }

    return this.getJob(input.id);
  }

  searchRuntimeText(input: {
    query: string;
    scope?: RuntimeSearchScope;
    limit?: number;
    messageScanLimit?: number;
  }): RuntimeSearchResult {
    const query = input.query.trim();
    const scope = input.scope ?? "all";
    const limit = Math.max(1, Math.trunc(input.limit ?? 25));
    const messageScanLimit = Math.max(limit, Math.trunc(input.messageScanLimit ?? 100));
    const like = `%${query}%`;
    const includeConversations = scope === "all" || scope === "conversations";
    const includeMessages = scope === "all" || scope === "messages";
    const includeJobs = scope === "all" || scope === "jobs";
    const includeReceipts = scope === "all" || scope === "receipts";

    const conversations = includeConversations
      ? (
          this.db
            .query(
              `
              SELECT id, session_id, title, summary, created_at, updated_at
              FROM conversations
              WHERE id LIKE ? OR COALESCE(session_id, '') LIKE ? OR COALESCE(title, '') LIKE ? OR COALESCE(summary, '') LIKE ?
              ORDER BY updated_at DESC
              LIMIT ?
            `,
            )
            .all(like, like, like, like, limit) as Record<string, unknown>[]
        ).map((row) =>
          conversationStateSchema.parse({
            id: String(row.id),
            sessionId: toNullableString(row.session_id),
            title: toNullableString(row.title),
            summary: toNullableString(row.summary),
            createdAt: Number(row.created_at),
            updatedAt: Number(row.updated_at),
          }),
        )
      : [];

    const messages = includeMessages
      ? (
          this.db
            .query(
              `
              SELECT id, conversation_id, sequence, role, content, parts_json, metadata_json, created_at
              FROM chat_messages
              WHERE id LIKE ? OR role LIKE ? OR content LIKE ?
              ORDER BY sequence DESC, created_at DESC, id DESC
              LIMIT ?
            `,
            )
            .all(like, like, like, messageScanLimit) as Record<string, unknown>[]
        )
          .map((row) => {
            const parsed = sqliteChatMessageRowSchema.parse(row);
            const normalized = normalizeStoredChatParts({
              content: parsed.content,
              partsJson: parsed.parts_json,
              metadataJson: parsed.metadata_json,
            });
            return chatMessageStateSchema.parse({
              id: parsed.id,
              conversationId: parsed.conversation_id,
              sequence: parsed.sequence,
              role: parsed.role,
              content: parsed.content,
              parts: normalized.parts,
              metadata: normalized.metadata,
              createdAt: parsed.created_at,
            });
          })
          .slice(0, limit)
      : [];

    const jobs = includeJobs
      ? (
          this.db
            .query(
              `
              SELECT *
              FROM jobs
              WHERE
                id LIKE ?
                OR bot_id LIKE ?
                OR routine_name LIKE ?
                OR status LIKE ?
                OR COALESCE(last_error, '') LIKE ?
                OR COALESCE(last_result_json, '') LIKE ?
              ORDER BY updated_at DESC
              LIMIT ?
            `,
            )
            .all(like, like, like, like, like, like, limit) as Record<string, unknown>[]
        ).map((row) => this.mapJobRow(row))
      : [];

    const receipts = includeReceipts
      ? (
          this.db
            .query(
              `
              SELECT payload_json
              FROM action_receipts
              WHERE idempotency_key LIKE ? OR payload_json LIKE ?
              ORDER BY timestamp DESC
              LIMIT ?
            `,
            )
            .all(like, like, limit) as { payload_json: string }[]
        )
          .map((row) => parseJsonWithSchema<ActionResult | null>(row.payload_json, actionResultSchema, null))
          .filter((entry): entry is ActionResult => entry !== null)
      : [];

    return {
      query,
      scope,
      totalMatches: conversations.length + messages.length + jobs.length + receipts.length,
      conversations,
      messages,
      jobs,
      receipts,
    };
  }

  getRuntimeKnowledgeSurface(input?: {
    recentConversationsLimit?: number;
    recentJobsLimit?: number;
    recentReceiptsLimit?: number;
  }): RuntimeKnowledgeSurface {
    const recentConversationsLimit = Math.max(1, Math.trunc(input?.recentConversationsLimit ?? 20));
    const recentJobsLimit = Math.max(1, Math.trunc(input?.recentJobsLimit ?? 20));
    const recentReceiptsLimit = Math.max(1, Math.trunc(input?.recentReceiptsLimit ?? 20));

    const counts = this.db
      .query(
        `
        SELECT
          (SELECT COUNT(*) FROM conversations) AS conversations_count,
          (SELECT COUNT(*) FROM chat_messages) AS messages_count,
          (SELECT COUNT(*) FROM jobs) AS jobs_count,
          (SELECT COUNT(*) FROM action_receipts) AS receipts_count
      `,
      )
      .get() as {
      conversations_count: number;
      messages_count: number;
      jobs_count: number;
      receipts_count: number;
    };

    const rawStatusCounts = this.db
      .query(
        `
        SELECT status, COUNT(*) AS count
        FROM jobs
        GROUP BY status
      `,
      )
      .all() as { status: JobStatus; count: number }[];
    const jobStatusCounts: Partial<Record<JobStatus, number>> = {};
    for (const row of rawStatusCounts) {
      jobStatusCounts[row.status] = Number(row.count);
    }

    return {
      schemaSnapshot: this.getSchemaSnapshot(),
      generatedAt: Date.now(),
      counts: {
        conversations: Number(counts.conversations_count ?? 0),
        messages: Number(counts.messages_count ?? 0),
        jobs: Number(counts.jobs_count ?? 0),
        receipts: Number(counts.receipts_count ?? 0),
      },
      jobStatusCounts,
      recentConversations: this.listConversations(recentConversationsLimit),
      recentJobs: this.listJobs().slice(0, recentJobsLimit),
      recentReceipts: this.getRecentReceipts(recentReceiptsLimit),
    };
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

  deleteConversation(id: string): boolean {
    const normalizedConversationId = id.trim();
    if (!normalizedConversationId) {
      return false;
    }

    const result = this.db
      .query(
        `
        DELETE FROM conversations
        WHERE id = ?
      `,
      )
      .run(normalizedConversationId);

    return result.changes > 0;
  }

  saveChatMessage(message: ChatMessageStateInput): void {
    const parsedInput = chatMessageStateInputSchema.parse(message);
    const parsed = chatMessageStateSchema.parse({
      ...parsedInput,
      parts: parsedInput.parts ?? buildTextOnlyChatParts(parsedInput.content),
      sequence: this.resolveChatMessageSequence({
        conversationId: parsedInput.conversationId,
        messageId: parsedInput.id,
        requestedSequence: parsedInput.sequence,
      }),
    });
    this.db
      .query(
        `
        INSERT INTO chat_messages (id, conversation_id, sequence, role, content, parts_json, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          conversation_id = excluded.conversation_id,
          sequence = excluded.sequence,
          role = excluded.role,
          content = excluded.content,
          parts_json = excluded.parts_json,
          metadata_json = excluded.metadata_json,
          created_at = excluded.created_at
      `,
      )
      .run(
        parsed.id,
        parsed.conversationId,
        parsed.sequence,
        parsed.role,
        parsed.content,
        JSON.stringify(parsed.parts),
        parsed.metadata === undefined ? null : JSON.stringify(parsed.metadata),
        parsed.createdAt,
      );
  }

  listChatMessages(conversationId: string, limit = 500): ChatMessageState[] {
    const rows = this.db
      .query(
        `
        SELECT id, conversation_id, sequence, role, content, parts_json, metadata_json, created_at
        FROM chat_messages
        WHERE conversation_id = ?
        ORDER BY sequence ASC, created_at ASC, id ASC
        LIMIT ?
      `,
      )
      .all(conversationId, Math.max(1, Math.trunc(limit))) as Record<string, unknown>[];

    return rows.map((row) => {
      const parsed = sqliteChatMessageRowSchema.parse(row);
      const normalized = normalizeStoredChatParts({
        content: parsed.content,
        partsJson: parsed.parts_json,
        metadataJson: parsed.metadata_json,
      });
      return chatMessageStateSchema.parse({
        id: parsed.id,
        conversationId: parsed.conversation_id,
        sequence: parsed.sequence,
        role: parsed.role,
        content: parsed.content,
        parts: normalized.parts,
        metadata: normalized.metadata,
        createdAt: parsed.created_at,
      });
    });
  }

  getConversationHistorySlice(input: {
    conversationId: string;
    beforeMessageId?: string;
    limit?: number;
    tokenBudget?: number;
  }): ConversationHistorySlice {
    const normalizedConversationId = input.conversationId.trim();
    if (!normalizedConversationId) {
      return createConversationHistorySlice({
        conversationId: input.conversationId,
        eligibleMessages: [],
        totalEligibleCount: 0,
        beforeMessageId: input.beforeMessageId,
        limit: input.limit,
        tokenBudget: input.tokenBudget,
      });
    }

    const beforeMessageId = input.beforeMessageId?.trim();
    let cursorSequence: number | null = null;

    if (beforeMessageId) {
      const cursorRow = this.db
        .query(
          `
          SELECT id, sequence
          FROM chat_messages
          WHERE conversation_id = ?
            AND id = ?
          LIMIT 1
        `,
        )
        .get(normalizedConversationId, beforeMessageId) as Record<string, unknown> | null;

      if (!cursorRow) {
        throw new Error(`beforeMessageId "${beforeMessageId}" was not found in conversation "${normalizedConversationId}"`);
      }

      cursorSequence = Number(cursorRow.sequence);
    }

    const countRow = this.db
      .query(
        beforeMessageId
          ? `
            SELECT COUNT(*) AS message_count
            FROM chat_messages
            WHERE conversation_id = ?
              AND sequence < ?
          `
          : `
            SELECT COUNT(*) AS message_count
            FROM chat_messages
            WHERE conversation_id = ?
          `,
      )
      .get(
        ...(beforeMessageId
          ? [normalizedConversationId, cursorSequence!]
          : [normalizedConversationId]),
      ) as { message_count?: number } | null;

    const rows = this.db
      .query(
        beforeMessageId
          ? `
            SELECT id, conversation_id, sequence, role, content, parts_json, metadata_json, created_at
            FROM chat_messages
            WHERE conversation_id = ?
              AND sequence < ?
            ORDER BY sequence DESC, created_at DESC, id DESC
            LIMIT ?
          `
          : `
            SELECT id, conversation_id, sequence, role, content, parts_json, metadata_json, created_at
            FROM chat_messages
            WHERE conversation_id = ?
            ORDER BY sequence DESC, created_at DESC, id DESC
            LIMIT ?
          `,
      )
      .all(
        ...(beforeMessageId
          ? [normalizedConversationId, cursorSequence!, MAX_CONVERSATION_HISTORY_SCAN_MESSAGES]
          : [normalizedConversationId, MAX_CONVERSATION_HISTORY_SCAN_MESSAGES]),
      ) as Record<string, unknown>[];

    const eligibleMessages = rows
      .map((row) => {
        const parsed = sqliteChatMessageRowSchema.parse(row);
        const normalized = normalizeStoredChatParts({
          content: parsed.content,
          partsJson: parsed.parts_json,
          metadataJson: parsed.metadata_json,
        });
        return chatMessageStateSchema.parse({
          id: parsed.id,
          conversationId: parsed.conversation_id,
          sequence: parsed.sequence,
          role: parsed.role,
          content: parsed.content,
          parts: normalized.parts,
          metadata: normalized.metadata,
          createdAt: parsed.created_at,
        });
      })
      .reverse();

    return createConversationHistorySlice({
      conversationId: normalizedConversationId,
      eligibleMessages,
      totalEligibleCount: Number(countRow?.message_count ?? 0),
      beforeMessageId,
      limit: input.limit,
      tokenBudget: input.tokenBudget,
    });
  }

  saveInstanceProfile(profile: InstanceProfileState): void {
    const parsed = instanceProfileStateSchema.parse(profile);
    this.db
      .query(
        `
        INSERT INTO instance_profiles (
          instance_id, display_name, summary, trading_style, risk_tolerance,
          preferred_assets_json, disliked_assets_json, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(instance_id) DO UPDATE SET
          display_name = excluded.display_name,
          summary = excluded.summary,
          trading_style = excluded.trading_style,
          risk_tolerance = excluded.risk_tolerance,
          preferred_assets_json = excluded.preferred_assets_json,
          disliked_assets_json = excluded.disliked_assets_json,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `,
      )
      .run(
        parsed.instanceId,
        parsed.displayName ?? null,
        parsed.summary ?? null,
        parsed.tradingStyle ?? null,
        parsed.riskTolerance ?? null,
        parsed.preferredAssets === undefined ? null : JSON.stringify(parsed.preferredAssets),
        parsed.dislikedAssets === undefined ? null : JSON.stringify(parsed.dislikedAssets),
        parsed.metadata === undefined ? null : JSON.stringify(parsed.metadata),
        parsed.createdAt,
        parsed.updatedAt,
      );
  }

  getInstanceProfile(instanceId: string): InstanceProfileState | null {
    const normalizedInstanceId = instanceId.trim();
    if (!normalizedInstanceId) {
      return null;
    }

    const row = this.db
      .query(
        `
        SELECT
          instance_id, display_name, summary, trading_style, risk_tolerance,
          preferred_assets_json, disliked_assets_json, metadata_json, created_at, updated_at
        FROM instance_profiles
        WHERE instance_id = ?
        LIMIT 1
      `,
      )
      .get(normalizedInstanceId) as Record<string, unknown> | null;

    if (!row) {
      return null;
    }

    const parsed = sqliteInstanceProfileRowSchema.parse(row);
    return instanceProfileStateSchema.parse({
      instanceId: parsed.instance_id,
      displayName: parsed.display_name ?? undefined,
      summary: parsed.summary ?? undefined,
      tradingStyle: parsed.trading_style ?? undefined,
      riskTolerance: parsed.risk_tolerance ?? undefined,
      preferredAssets:
        parsed.preferred_assets_json == null
          ? undefined
          : parseJson<string[] | undefined>(parsed.preferred_assets_json, undefined),
      dislikedAssets:
        parsed.disliked_assets_json == null
          ? undefined
          : parseJson<string[] | undefined>(parsed.disliked_assets_json, undefined),
      metadata:
        parsed.metadata_json == null
          ? undefined
          : parseJson<Record<string, unknown> | undefined>(parsed.metadata_json, undefined),
      createdAt: parsed.created_at,
      updatedAt: parsed.updated_at,
    });
  }

  saveInstanceFact(fact: InstanceFactState): void {
    const parsed = instanceFactStateSchema.parse(fact);
    this.db
      .query(
        `
        INSERT INTO instance_facts (
          id, instance_id, fact_key, fact_value_json, confidence, source, source_message_id, created_at, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(instance_id, fact_key) DO UPDATE SET
          id = excluded.id,
          fact_value_json = excluded.fact_value_json,
          confidence = excluded.confidence,
          source = excluded.source,
          source_message_id = excluded.source_message_id,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at
      `,
      )
      .run(
        parsed.id,
        parsed.instanceId,
        parsed.factKey,
        JSON.stringify(parsed.factValue),
        parsed.confidence,
        parsed.source,
        parsed.sourceMessageId ?? null,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.expiresAt ?? null,
      );
  }

  listInstanceFacts(input: {
    instanceId: string;
    limit?: number;
    includeExpired?: boolean;
    keyPrefix?: string;
  }): InstanceFactState[] {
    const instanceId = input.instanceId.trim();
    if (!instanceId) {
      return [];
    }

    const includeExpired = input.includeExpired === true;
    const keyPrefix = input.keyPrefix?.trim();
    const rows = this.db
      .query(
        `
        SELECT
          id, instance_id, fact_key, fact_value_json, confidence, source, source_message_id, created_at, updated_at, expires_at
        FROM instance_facts
        WHERE instance_id = ?
          AND (? IS NULL OR fact_key LIKE ?)
          AND (? = 1 OR expires_at IS NULL OR expires_at > ?)
        ORDER BY updated_at DESC
        LIMIT ?
      `,
      )
      .all(
        instanceId,
        keyPrefix ?? null,
        keyPrefix ? `${keyPrefix}%` : null,
        includeExpired ? 1 : 0,
        Date.now(),
        Math.max(1, Math.trunc(input.limit ?? 200)),
      ) as Record<string, unknown>[];

    return rows.map((row) => {
      const parsed = sqliteInstanceFactRowSchema.parse(row);
      return instanceFactStateSchema.parse({
        id: parsed.id,
        instanceId: parsed.instance_id,
        factKey: parsed.fact_key,
        factValue: parseJson<unknown>(parsed.fact_value_json, null),
        confidence: parsed.confidence,
        source: parsed.source,
        sourceMessageId: parsed.source_message_id ?? undefined,
        createdAt: parsed.created_at,
        updatedAt: parsed.updated_at,
        expiresAt: parsed.expires_at ?? undefined,
      });
    });
  }

  getInstanceFact(input: { instanceId: string; factKey: string; includeExpired?: boolean }): InstanceFactState | null {
    const instanceId = input.instanceId.trim();
    const factKey = input.factKey.trim();
    if (!instanceId || !factKey) {
      return null;
    }

    const includeExpired = input.includeExpired === true;
    const row = this.db
      .query(
        `
        SELECT
          id, instance_id, fact_key, fact_value_json, confidence, source, source_message_id, created_at, updated_at, expires_at
        FROM instance_facts
        WHERE instance_id = ? AND fact_key = ?
          AND (? = 1 OR expires_at IS NULL OR expires_at > ?)
        LIMIT 1
      `,
      )
      .get(instanceId, factKey, includeExpired ? 1 : 0, Date.now()) as Record<string, unknown> | null;

    if (!row) {
      return null;
    }

    const parsed = sqliteInstanceFactRowSchema.parse(row);
    return instanceFactStateSchema.parse({
      id: parsed.id,
      instanceId: parsed.instance_id,
      factKey: parsed.fact_key,
      factValue: parseJson<unknown>(parsed.fact_value_json, null),
      confidence: parsed.confidence,
      source: parsed.source,
      sourceMessageId: parsed.source_message_id ?? undefined,
      createdAt: parsed.created_at,
      updatedAt: parsed.updated_at,
      expiresAt: parsed.expires_at ?? undefined,
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
      serialNumber: parsedRow.serial_number ?? undefined,
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
      attemptCount: parsedRow.attempt_count ?? 0,
      leaseOwner: parsedRow.lease_owner ?? undefined,
      leaseExpiresAt: parsedRow.lease_expires_at ?? undefined,
      lastError: parsedRow.last_error ?? undefined,
      createdAt: parsedRow.created_at,
      updatedAt: parsedRow.updated_at,
    });
  }

  private readNextJobSerialNumber(): number {
    const row = this.db
      .query(
        `
        SELECT COALESCE(MAX(serial_number), 0) AS max_serial_number
        FROM jobs
      `,
      )
      .get() as { max_serial_number?: number | null } | null;
    return Math.max(1, Math.trunc(Number(row?.max_serial_number ?? 0) + 1));
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
