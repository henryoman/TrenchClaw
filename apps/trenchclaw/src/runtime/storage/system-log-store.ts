import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import type { RuntimeLogEntry } from "../logging";

export interface SystemLogStoreConfig {
  directory: string;
}

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath);

const dateKey = (timestampIso: string): string => timestampIso.slice(0, 10);

export class SystemLogStore {
  private readonly directory: string;

  constructor(config: SystemLogStoreConfig) {
    this.directory = toAbsolutePath(config.directory);
    mkdirSync(this.directory, { recursive: true });
  }

  append(entry: RuntimeLogEntry): string {
    const key = dateKey(entry.timestamp);
    const filePath = path.join(this.directory, `${key}.log`);
    const details = entry.details ? ` ${JSON.stringify(entry.details)}` : "";
    const line = `${entry.timestamp} ${entry.level.toUpperCase()} ${entry.event}${details}\n`;
    appendFileSync(filePath, line, "utf8");
    return filePath;
  }
}
