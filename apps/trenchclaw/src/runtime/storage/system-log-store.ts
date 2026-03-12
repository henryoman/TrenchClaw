import { mkdirSync } from "node:fs";
import path from "node:path";

import type { RuntimeLogEntry } from "../logging/runtime-logger";
import { assertRuntimeSystemWritePath } from "../security/write-scope";
import { resolveRuntimeContractPath } from "../runtime-paths";
import { getLogIoWorkerClient } from "./log-io-worker";

export interface SystemLogStoreConfig {
  directory: string;
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
    const filePath = path.join(this.directory, `${key}.log`);
    assertRuntimeSystemWritePath(filePath, "append system log entry");
    const details = entry.details ? ` ${JSON.stringify(entry.details)}` : "";
    const line = `${entry.timestamp} ${entry.level.toUpperCase()} ${entry.event}${details}\n`;
    void this.writer.appendUtf8(filePath, line);
    return filePath;
  }
}
