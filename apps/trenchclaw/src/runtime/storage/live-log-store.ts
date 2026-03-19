import { mkdirSync } from "node:fs";
import path from "node:path";

import type { RuntimeLogEntry } from "../logging/runtime-logger";
import { assertRuntimeSystemWritePath } from "../security/write-scope";
import { resolveRuntimeContractPath } from "../runtime-paths";
import { getLogIoWorkerClient } from "./log-io-worker";

export interface LiveLogStoreConfig {
  directory: string;
}

interface LiveLogJsonLine {
  ts: string;
  product: "live";
  source: "runtime";
  level: RuntimeLogEntry["level"];
  kind: string;
  summary: string;
  details?: Record<string, unknown>;
}

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : resolveRuntimeContractPath(targetPath);

const dateKey = (timestampIso: string): string => timestampIso.slice(0, 10);

export class LiveLogStore {
  private readonly directory: string;
  private readonly writer = getLogIoWorkerClient();

  constructor(config: LiveLogStoreConfig) {
    this.directory = toAbsolutePath(config.directory);
    assertRuntimeSystemWritePath(this.directory, "initialize live log directory");
    mkdirSync(this.directory, { recursive: true });
  }

  append(entry: RuntimeLogEntry): string {
    const filePath = path.join(this.directory, `${dateKey(entry.timestamp)}.console.jsonl`);
    assertRuntimeSystemWritePath(filePath, "append live log entry");
    const line: LiveLogJsonLine = {
      ts: entry.timestamp,
      product: "live",
      source: "runtime",
      level: entry.level,
      kind: entry.event,
      summary: entry.event,
      ...(entry.details ? { details: entry.details } : {}),
    };
    void this.writer.appendUtf8(filePath, `${JSON.stringify(line)}\n`);
    return filePath;
  }
}
