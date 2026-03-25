import path from "node:path";
import { createSessionId, type SessionId } from "../../ai/contracts/types/ids";
import type { RuntimeSessionMessageRole, RuntimeSessionState, RuntimeSessionSummaryRecord } from "../../contracts/persistence";
import {
  appendJsonLineAsync,
  ensureWritableStoragePath,
  getStorageWriter,
  initializeStorageDirectory,
  writeJsonFile,
} from "./log-files";

type SessionMessageRole = "system" | "user" | "assistant" | "toolResult";

interface SessionStoreEntry {
  sessionId: SessionId;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  eventCount: number;
  source: string;
}

interface SessionStoreData {
  version: 1;
  sessions: Record<string, SessionStoreEntry>;
}

interface SessionMessageRecord {
  type: "message";
  timestamp: string;
  sessionKey: string;
  sessionId: SessionId;
  message: {
    role: SessionMessageRole;
    content: Array<{ type: "text"; text: string }>;
    usage?: {
      cost?: {
        total?: number;
      };
    };
  };
}

interface SessionMetaRecord {
  type: "session";
  timestamp: string;
  sessionKey: string;
  sessionId: SessionId;
  source: string;
  metadata?: Record<string, unknown>;
}

interface SessionEventRecord {
  type: "event";
  timestamp: string;
  sessionKey: string;
  sessionId: SessionId;
  eventType: string;
  payload: unknown;
}

type SessionJsonLine = SessionMetaRecord | SessionMessageRecord | SessionEventRecord;

type SessionLogSqliteBridge = {
  openRuntimeSession(input: {
    agentId: string;
    sessionKey: string;
    source: string;
    reuseSessionOnBoot?: boolean;
  }): RuntimeSessionState;
  appendRuntimeSessionMessage(input: {
    sessionId: string;
    role: RuntimeSessionMessageRole;
    text: string;
    usage?: SessionMessageRecord["message"]["usage"];
  }): void;
  appendRuntimeSessionEvent(input: {
    sessionId: string;
    eventType: string;
    payload: unknown;
  }): void;
  getRuntimeSessionStats(sessionId: string): RuntimeSessionState | null;
};

export interface SessionLogStoreConfig {
  directory: string;
  agentId: string;
  sessionKey: string;
  source: string;
  reuseSessionOnBoot?: boolean;
  sqliteStateStore?: SessionLogSqliteBridge;
}

export interface ActiveSessionInfo {
  agentId: string;
  sessionKey: string;
  sessionId: SessionId;
  sessionFilePath: string;
  source: string;
}

export interface ActiveSessionStats {
  sessionId: SessionId;
  sessionKey: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  eventCount: number;
}

export interface SessionSummaryInput {
  sessionId: string;
  sessionKey: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  eventCount: number;
  profile: "safe" | "dangerous" | "veryDangerous";
  schedulerTickMs: number;
  registeredActions: string[];
  pendingJobsAtStop: number;
}

export interface SessionSummaryRecord extends SessionSummaryInput {
  startedAt: string;
  endedAt: string;
  durationSec: number;
  compactionLevel: "basic";
}

export interface SessionSummaryStoreConfig {
  directory: string;
  sqliteStateStore?: {
    saveRuntimeSessionSummary(summary: RuntimeSessionSummaryRecord): void;
    endRuntimeSession(sessionId: string): void;
  };
}

const indexFileName = "index.json";

const createEmptyStore = (): SessionStoreData => ({
  version: 1,
  sessions: {},
});

const nowIso = (): string => new Date().toISOString();

export class SessionLogStore {
  private readonly directory: string;
  private readonly indexFilePath: string;
  private readonly agentId: string;
  private readonly sessionKey: string;
  private readonly source: string;
  private readonly reuseSessionOnBoot: boolean;
  private readonly sqliteStateStore?: SessionLogSqliteBridge;
  private active: ActiveSessionInfo | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly writer = getStorageWriter();

  constructor(config: SessionLogStoreConfig) {
    this.sqliteStateStore = config.sqliteStateStore;
    this.directory = this.sqliteStateStore
      ? config.directory
      : initializeStorageDirectory(config.directory, "initialize session log directory");
    this.indexFilePath = path.join(this.directory, indexFileName);
    if (!this.sqliteStateStore) {
      ensureWritableStoragePath(this.indexFilePath, "initialize sessions index file");
    }
    this.agentId = config.agentId.trim() || "main";
    this.sessionKey = config.sessionKey.trim() || `agent:${this.agentId}:main`;
    this.source = config.source.trim() || "cli";
    this.reuseSessionOnBoot = config.reuseSessionOnBoot ?? true;
  }

  async open(): Promise<ActiveSessionInfo> {
    if (this.active) {
      return this.active;
    }
    return this.enqueueWrite(async () => this.openInternal());
  }

  async flush(): Promise<void> {
    await this.writeChain;
  }

  getActiveSession(): ActiveSessionInfo | null {
    return this.active;
  }

  async getActiveSessionStats(): Promise<ActiveSessionStats | null> {
    const active = this.active;
    if (!active) {
      return null;
    }

    if (this.sqliteStateStore) {
      const stats = this.sqliteStateStore.getRuntimeSessionStats(active.sessionId);
      if (!stats) {
        return null;
      }
      return {
        sessionId: stats.sessionId,
        sessionKey: stats.sessionKey,
        source: stats.source,
        createdAt: new Date(stats.createdAt).toISOString(),
        updatedAt: new Date(stats.updatedAt).toISOString(),
        messageCount: stats.messageCount,
        eventCount: stats.eventCount,
      };
    }

    const store = await this.readStore();
    const entry = store.sessions[active.sessionKey];
    if (!entry) {
      return null;
    }

    return {
      sessionId: entry.sessionId,
      sessionKey: active.sessionKey,
      source: entry.source,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      messageCount: entry.messageCount,
      eventCount: entry.eventCount,
    };
  }

  async appendMessage(
    role: SessionMessageRole,
    text: string,
    usage?: SessionMessageRecord["message"]["usage"],
  ): Promise<void> {
    await this.enqueueWrite(async () => {
      const active = await this.ensureOpenInternal();
      if (this.sqliteStateStore) {
        this.sqliteStateStore.appendRuntimeSessionMessage({
          sessionId: active.sessionId,
          role,
          text,
          usage,
        });
        return;
      }
      const line: SessionMessageRecord = {
        type: "message",
        timestamp: nowIso(),
        sessionKey: active.sessionKey,
        sessionId: active.sessionId,
        message: {
          role,
          content: [{ type: "text", text }],
          usage,
        },
      };
      await this.appendRaw(line);
      await this.bumpCounters({ messageCountDelta: 1 });
    });
  }

  async appendEvent(eventType: string, payload: unknown): Promise<void> {
    await this.enqueueWrite(async () => {
      const active = await this.ensureOpenInternal();
      if (this.sqliteStateStore) {
        this.sqliteStateStore.appendRuntimeSessionEvent({
          sessionId: active.sessionId,
          eventType,
          payload,
        });
        return;
      }
      const line: SessionEventRecord = {
        type: "event",
        timestamp: nowIso(),
        sessionKey: active.sessionKey,
        sessionId: active.sessionId,
        eventType,
        payload,
      };
      await this.appendRaw(line);
      await this.bumpCounters({ eventCountDelta: 1 });
    });
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writeChain.then(operation);
    this.writeChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async openInternal(): Promise<ActiveSessionInfo> {
    if (this.sqliteStateStore) {
      const session = this.sqliteStateStore.openRuntimeSession({
        agentId: this.agentId,
        sessionKey: this.sessionKey,
        source: this.source,
        reuseSessionOnBoot: this.reuseSessionOnBoot,
      });
      this.active = {
        agentId: this.agentId,
        sessionKey: session.sessionKey,
        sessionId: session.sessionId,
        sessionFilePath: `sqlite:${session.sessionId}`,
        source: session.source,
      };
      return this.active;
    }

    const store = await this.readStore();
    const now = nowIso();
    const existing = store.sessions[this.sessionKey];

    if (this.reuseSessionOnBoot && existing) {
      const existingSessionFilePath = path.join(this.directory, `${existing.sessionId}.jsonl`);
      const existingFile = Bun.file(existingSessionFilePath);
      if (await existingFile.exists()) {
        this.active = {
          agentId: this.agentId,
          sessionKey: this.sessionKey,
          sessionId: existing.sessionId,
          sessionFilePath: existingSessionFilePath,
          source: existing.source,
        };
        existing.updatedAt = now;
        await this.writeStore(store);
        await this.appendRaw({
          type: "session",
          timestamp: now,
          sessionKey: this.sessionKey,
          sessionId: existing.sessionId,
          source: existing.source,
          metadata: {
            agentId: this.agentId,
            resumed: true,
          },
        });
        return this.active;
      }
    }

    const sessionId = createSessionId();
    const sessionEntry: SessionStoreEntry = {
      sessionId,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      eventCount: 0,
      source: this.source,
    };
    store.sessions[this.sessionKey] = sessionEntry;
    await this.writeStore(store);

    const sessionFilePath = path.join(this.directory, `${sessionId}.jsonl`);
    ensureWritableStoragePath(sessionFilePath, "create session log file");
    this.active = {
      agentId: this.agentId,
      sessionKey: this.sessionKey,
      sessionId,
      sessionFilePath,
      source: this.source,
    };

    await this.appendRaw({
      type: "session",
      timestamp: now,
      sessionKey: this.sessionKey,
      sessionId,
      source: this.source,
      metadata: {
        agentId: this.agentId,
      },
    });

    return this.active;
  }

  private async ensureOpenInternal(): Promise<ActiveSessionInfo> {
    if (this.active) {
      return this.active;
    }
    return this.openInternal();
  }

  private async readStore(): Promise<SessionStoreData> {
    const file = Bun.file(this.indexFilePath);
    if (!(await file.exists())) {
      return createEmptyStore();
    }

    const raw = await file.text();
    if (!raw.trim()) {
      return createEmptyStore();
    }

    try {
      const parsed = JSON.parse(raw) as Partial<SessionStoreData>;
      if (parsed.version !== 1 || !parsed.sessions || typeof parsed.sessions !== "object") {
        return createEmptyStore();
      }
      return parsed as SessionStoreData;
    } catch {
      return createEmptyStore();
    }
  }

  private async writeStore(store: SessionStoreData): Promise<void> {
    ensureWritableStoragePath(this.indexFilePath, "write sessions index file");
    await this.writer.writeUtf8(this.indexFilePath, `${JSON.stringify(store, null, 2)}\n`);
  }

  private async appendRaw(line: SessionJsonLine): Promise<void> {
    const active = await this.ensureOpenInternal();
    await appendJsonLineAsync(this.writer, active.sessionFilePath, line, "append session log entry");
  }

  private async bumpCounters(input: { messageCountDelta?: number; eventCountDelta?: number }): Promise<void> {
    const store = await this.readStore();
    const entry = store.sessions[this.sessionKey];
    if (!entry) {
      return;
    }

    entry.updatedAt = nowIso();
    entry.messageCount += input.messageCountDelta ?? 0;
    entry.eventCount += input.eventCountDelta ?? 0;
    await this.writeStore(store);
  }
}

export class SessionSummaryStore {
  private readonly directory: string;
  private readonly sqliteStateStore?: SessionSummaryStoreConfig["sqliteStateStore"];
  private readonly writer = getStorageWriter();

  constructor(config: SessionSummaryStoreConfig) {
    this.sqliteStateStore = config.sqliteStateStore;
    this.directory = this.sqliteStateStore
      ? config.directory
      : initializeStorageDirectory(config.directory, "initialize session summary directory");
  }

  async writeSummary(summary: SessionSummaryInput): Promise<string> {
    const created = new Date(summary.createdAt).getTime();
    const updated = new Date(summary.updatedAt).getTime();
    const durationMs = Number.isFinite(created) && Number.isFinite(updated) ? Math.max(0, updated - created) : 0;
    const record: SessionSummaryRecord = {
      ...summary,
      startedAt: summary.createdAt,
      endedAt: summary.updatedAt,
      durationSec: Math.round(durationMs / 1000),
      compactionLevel: "basic",
    };

    if (this.sqliteStateStore) {
      this.sqliteStateStore.saveRuntimeSessionSummary({
        sessionId: record.sessionId,
        sessionKey: record.sessionKey,
        source: record.source,
        createdAt: created,
        updatedAt: updated,
        messageCount: record.messageCount,
        eventCount: record.eventCount,
        profile: record.profile,
        schedulerTickMs: record.schedulerTickMs,
        registeredActions: record.registeredActions,
        pendingJobsAtStop: record.pendingJobsAtStop,
        startedAt: created,
        endedAt: updated,
        durationSec: record.durationSec,
        compactionLevel: record.compactionLevel,
      });
      this.sqliteStateStore.endRuntimeSession(record.sessionId);
      return `sqlite:${record.sessionId}:summary`;
    }

    const filePath = path.join(this.directory, `${summary.sessionId}.summary.json`);
    return writeJsonFile(this.writer, filePath, record, "write session summary");
  }
}
