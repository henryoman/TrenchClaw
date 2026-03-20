import path from "node:path";
import { getStorageWriter, initializeStorageDirectory, writeJsonFile } from "./storage-shared";

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
}

export class SessionSummaryStore {
  private readonly directory: string;
  private readonly writer = getStorageWriter();

  constructor(config: SessionSummaryStoreConfig) {
    this.directory = initializeStorageDirectory(config.directory, "initialize session summary directory");
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

    const filePath = path.join(this.directory, `${summary.sessionId}.summary.json`);
    return writeJsonFile(this.writer, filePath, record, "write session summary");
  }
}
