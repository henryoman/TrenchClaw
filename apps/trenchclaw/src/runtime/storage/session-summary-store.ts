import { mkdirSync } from "node:fs";
import path from "node:path";
import { assertRuntimeSystemWritePath } from "../security/write-scope";
import { resolveRuntimeContractPath } from "../runtime-paths";
import { getLogIoWorkerClient } from "./log-io-worker";

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

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : resolveRuntimeContractPath(targetPath);

export class SessionSummaryStore {
  private readonly directory: string;
  private readonly writer = getLogIoWorkerClient();

  constructor(config: SessionSummaryStoreConfig) {
    this.directory = toAbsolutePath(config.directory);
    assertRuntimeSystemWritePath(this.directory, "initialize session summary directory");
    mkdirSync(this.directory, { recursive: true });
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
    assertRuntimeSystemWritePath(filePath, "write session summary");
    await this.writer.writeUtf8(filePath, `${JSON.stringify(record, null, 2)}\n`);
    return filePath;
  }
}
