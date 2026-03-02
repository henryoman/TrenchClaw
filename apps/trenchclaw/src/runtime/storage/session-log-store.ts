import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertRuntimeSystemWritePath } from "../security/write-scope";
import { getLogIoWorkerClient } from "./log-io-worker";

type SessionMessageRole = "system" | "user" | "assistant" | "toolResult";

interface SessionStoreEntry {
  sessionId: string;
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
  sessionId: string;
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
  sessionId: string;
  source: string;
  metadata?: Record<string, unknown>;
}

interface SessionEventRecord {
  type: "event";
  timestamp: string;
  sessionKey: string;
  sessionId: string;
  eventType: string;
  payload: unknown;
}

type SessionJsonLine = SessionMetaRecord | SessionMessageRecord | SessionEventRecord;

export interface SessionLogStoreConfig {
  directory: string;
  agentId: string;
  sessionKey: string;
  source: string;
}

export interface ActiveSessionInfo {
  agentId: string;
  sessionKey: string;
  sessionId: string;
  sessionFilePath: string;
  source: string;
}

export interface ActiveSessionStats {
  sessionId: string;
  sessionKey: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  eventCount: number;
}

const APP_ROOT_DIRECTORY = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(APP_ROOT_DIRECTORY, targetPath);

const indexFileName = "sessions.json";

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
  private active: ActiveSessionInfo | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly writer = getLogIoWorkerClient();

  constructor(config: SessionLogStoreConfig) {
    this.directory = toAbsolutePath(config.directory);
    this.indexFilePath = path.join(this.directory, indexFileName);
    assertRuntimeSystemWritePath(this.directory, "initialize session log directory");
    assertRuntimeSystemWritePath(this.indexFilePath, "initialize sessions index file");
    this.agentId = config.agentId.trim() || "main";
    this.sessionKey = config.sessionKey.trim() || `agent:${this.agentId}:main`;
    this.source = config.source.trim() || "cli";
    mkdirSync(this.directory, { recursive: true });
  }

  async open(): Promise<ActiveSessionInfo> {
    const store = await this.readStore();
    const now = nowIso();

    const sessionId = crypto.randomUUID();
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
    assertRuntimeSystemWritePath(sessionFilePath, "create session log file");
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

  getActiveSession(): ActiveSessionInfo | null {
    return this.active;
  }

  async getActiveSessionStats(): Promise<ActiveSessionStats | null> {
    const active = this.active;
    if (!active) {
      return null;
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
    const active = await this.ensureOpen();
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
  }

  async appendEvent(eventType: string, payload: unknown): Promise<void> {
    const active = await this.ensureOpen();
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
  }

  private async ensureOpen(): Promise<ActiveSessionInfo> {
    if (this.active) {
      return this.active;
    }
    return this.open();
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
    assertRuntimeSystemWritePath(this.indexFilePath, "write sessions index file");
    await this.writer.writeUtf8(this.indexFilePath, `${JSON.stringify(store, null, 2)}\n`);
  }

  private async appendRaw(line: SessionJsonLine): Promise<void> {
    const active = await this.ensureOpen();
    const encoded = `${JSON.stringify(line)}\n`;
    this.writeChain = this.writeChain.then(async () => {
      assertRuntimeSystemWritePath(active.sessionFilePath, "append session log entry");
      await this.writer.appendUtf8(active.sessionFilePath, encoded);
    });
    await this.writeChain;
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
