import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertRuntimeSystemWritePath } from "../security/write-scope";

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

const APP_ROOT_DIRECTORY = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(APP_ROOT_DIRECTORY, targetPath);

const dateKey = (timestampIso: string): string => timestampIso.slice(0, 10);

export class SummaryLogStore {
  private readonly directory: string;

  constructor(config: SummaryLogStoreConfig) {
    this.directory = toAbsolutePath(config.directory);
    assertRuntimeSystemWritePath(this.directory, "initialize summary log directory");
    mkdirSync(this.directory, { recursive: true });
  }

  append(entry: RuntimeSummaryEntry): string {
    const filePath = path.join(this.directory, `${dateKey(entry.timestamp)}.log`);
    assertRuntimeSystemWritePath(filePath, "append runtime summary log entry");
    const details = entry.details ? ` ${JSON.stringify(entry.details)}` : "";
    const line = `${entry.timestamp} ${entry.category.toUpperCase()} ${entry.event}${details}\n`;
    appendFileSync(filePath, line, "utf8");
    return filePath;
  }
}
