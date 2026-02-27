import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertRuntimeSystemWritePath } from "../security/write-scope";

export interface MemoryLogStoreConfig {
  directory: string;
  longTermFile: string;
}

const APP_ROOT_DIRECTORY = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(APP_ROOT_DIRECTORY, targetPath);

const resolveLongTermFilePath = (directory: string, targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(directory, targetPath);

const currentDateKey = (): string => new Date().toISOString().slice(0, 10);

export class MemoryLogStore {
  private readonly directory: string;
  private readonly longTermFile: string;

  constructor(config: MemoryLogStoreConfig) {
    this.directory = toAbsolutePath(config.directory);
    this.longTermFile = resolveLongTermFilePath(this.directory, config.longTermFile);
    assertRuntimeSystemWritePath(this.directory, "initialize memory log directory");
    assertRuntimeSystemWritePath(this.longTermFile, "initialize long-term memory log file");
    mkdirSync(this.directory, { recursive: true });
    mkdirSync(path.dirname(this.longTermFile), { recursive: true });
  }

  appendDaily(note: string, dateKey = currentDateKey()): string {
    const target = path.join(this.directory, `${dateKey}.md`);
    assertRuntimeSystemWritePath(target, "append daily memory note");
    appendFileSync(target, `${note.trim()}\n\n`, "utf8");
    return target;
  }

  appendLongTerm(note: string): string {
    assertRuntimeSystemWritePath(this.longTermFile, "append long-term memory note");
    appendFileSync(this.longTermFile, `${note.trim()}\n\n`, "utf8");
    return this.longTermFile;
  }
}
