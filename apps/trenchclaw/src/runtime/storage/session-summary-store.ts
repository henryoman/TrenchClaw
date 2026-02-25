import { mkdirSync } from "node:fs";
import path from "node:path";

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

export interface SessionSummaryStoreConfig {
  directory: string;
}

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath);

export class SessionSummaryStore {
  private readonly directory: string;

  constructor(config: SessionSummaryStoreConfig) {
    this.directory = toAbsolutePath(config.directory);
    mkdirSync(this.directory, { recursive: true });
  }

  async writeSummary(summary: SessionSummaryInput): Promise<string> {
    const created = new Date(summary.createdAt).getTime();
    const updated = new Date(summary.updatedAt).getTime();
    const durationMs = Number.isFinite(created) && Number.isFinite(updated) ? Math.max(0, updated - created) : 0;
    const durationSec = Math.round(durationMs / 1000);

    const body = [
      `# Session Summary (${summary.sessionId})`,
      "",
      `- sessionKey: ${summary.sessionKey}`,
      `- source: ${summary.source}`,
      `- profile: ${summary.profile}`,
      `- startedAt: ${summary.createdAt}`,
      `- endedAt: ${summary.updatedAt}`,
      `- durationSec: ${durationSec}`,
      `- messageCount: ${summary.messageCount}`,
      `- eventCount: ${summary.eventCount}`,
      `- pendingJobsAtStop: ${summary.pendingJobsAtStop}`,
      `- schedulerTickMs: ${summary.schedulerTickMs}`,
      `- registeredActions: ${summary.registeredActions.join(", ") || "none"}`,
      "",
    ].join("\n");

    const filePath = path.join(this.directory, `${summary.sessionId}.md`);
    await Bun.write(filePath, body);
    return filePath;
  }
}
