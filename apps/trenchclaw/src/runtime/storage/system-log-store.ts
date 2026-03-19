import { mkdirSync } from "node:fs";
import path from "node:path";

import type { RuntimeLogEntry } from "../logging/runtime-logger";
import { assertRuntimeSystemWritePath } from "../security/write-scope";
import { resolveRuntimeContractPath } from "../runtime-paths";
import { getLogIoWorkerClient } from "./log-io-worker";

export interface SystemLogStoreConfig {
  directory: string;
}

interface SystemLogJsonLine {
  ts: string;
  product: "system";
  source: "system";
  level: RuntimeLogEntry["level"];
  kind: string;
  summary: string;
  details?: Record<string, unknown>;
}

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : resolveRuntimeContractPath(targetPath);

const dateKey = (timestampIso: string): string => timestampIso.slice(0, 10);

export class SystemLogStore {
  private readonly directory: string;
  private readonly writer = getLogIoWorkerClient();

  constructor(config: SystemLogStoreConfig) {
    this.directory = toAbsolutePath(config.directory);
    assertRuntimeSystemWritePath(this.directory, "initialize system log directory");
    mkdirSync(this.directory, { recursive: true });
  }

  append(entry: RuntimeLogEntry): string {
    const key = dateKey(entry.timestamp);
    const filePath = path.join(this.directory, `${key}.system.jsonl`);
    assertRuntimeSystemWritePath(filePath, "append system log entry");
    const line: SystemLogJsonLine = {
      ts: entry.timestamp,
      product: "system",
      source: "system",
      level: entry.level,
      kind: entry.event,
      summary: entry.event,
      ...(entry.details ? { details: entry.details } : {}),
    };
    void this.writer.appendUtf8(filePath, `${JSON.stringify(line)}\n`);
    return filePath;
  }
}
