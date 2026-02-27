import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { RuntimeLogEntry } from "../logging";
import { assertRuntimeSystemWritePath } from "../security/write-scope";

export interface SystemLogStoreConfig {
  directory: string;
}

const APP_ROOT_DIRECTORY = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(APP_ROOT_DIRECTORY, targetPath);

const dateKey = (timestampIso: string): string => timestampIso.slice(0, 10);

export class SystemLogStore {
  private readonly directory: string;

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
    appendFileSync(filePath, line, "utf8");
    return filePath;
  }
}
