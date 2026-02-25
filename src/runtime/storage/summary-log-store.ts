import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export type RuntimeSummaryCategory = "runtime" | "trade" | "data";

export interface RuntimeSummaryEntry {
  timestamp: string;
  category: RuntimeSummaryCategory;
  event: string;
  details?: Record<string, unknown>;
}

export interface SummaryLogStoreConfig {
  directory: string;
}

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath);

const dateKey = (timestampIso: string): string => timestampIso.slice(0, 10);

export class SummaryLogStore {
  private readonly directory: string;

  constructor(config: SummaryLogStoreConfig) {
    this.directory = toAbsolutePath(config.directory);
    mkdirSync(this.directory, { recursive: true });
  }

  append(entry: RuntimeSummaryEntry): string {
    const filePath = path.join(this.directory, `${dateKey(entry.timestamp)}.log`);
    const details = entry.details ? ` ${JSON.stringify(entry.details)}` : "";
    const line = `${entry.timestamp} ${entry.category.toUpperCase()} ${entry.event}${details}\n`;
    appendFileSync(filePath, line, "utf8");
    return filePath;
  }
}
