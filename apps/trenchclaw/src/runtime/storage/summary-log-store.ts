import { mkdirSync } from "node:fs";
import path from "node:path";
import { assertRuntimeSystemWritePath } from "../security/write-scope";
import { resolveRuntimeContractPath } from "../runtime-paths";
import { getLogIoWorkerClient } from "./log-io-worker";

export type RuntimeSummaryCategory = "runtime" | "trade" | "data";

export interface RuntimeSummaryEntry {
  timestamp: string;
  category: RuntimeSummaryCategory;
  event: string;
  details?: Record<string, unknown>;
}

interface RuntimeSummaryJsonLine {
  ts: string;
  product: "summary";
  source: "runtime" | "queue" | "chat" | "system";
  category: RuntimeSummaryCategory;
  kind: string;
  summary: string;
  details?: Record<string, unknown>;
}

export interface SummaryLogStoreConfig {
  directory: string;
}

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : resolveRuntimeContractPath(targetPath);

const dateKey = (timestampIso: string): string => timestampIso.slice(0, 10);

export class SummaryLogStore {
  private readonly directory: string;
  private readonly writer = getLogIoWorkerClient();

  constructor(config: SummaryLogStoreConfig) {
    this.directory = toAbsolutePath(config.directory);
    assertRuntimeSystemWritePath(this.directory, "initialize summary log directory");
    mkdirSync(this.directory, { recursive: true });
  }

  append(entry: RuntimeSummaryEntry): string {
    const filePath = path.join(this.directory, `${dateKey(entry.timestamp)}.summary.jsonl`);
    assertRuntimeSystemWritePath(filePath, "append runtime summary log entry");
    const line: RuntimeSummaryJsonLine = {
      ts: entry.timestamp,
      product: "summary",
      source: "runtime",
      category: entry.category,
      kind: entry.event,
      summary: entry.event,
      ...(entry.details ? { details: entry.details } : {}),
    };
    void this.writer.appendUtf8(filePath, `${JSON.stringify(line)}\n`);
    return filePath;
  }
}
