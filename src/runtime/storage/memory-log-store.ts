import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export interface MemoryLogStoreConfig {
  directory: string;
  longTermFile: string;
}

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath);

const currentDateKey = (): string => new Date().toISOString().slice(0, 10);

export class MemoryLogStore {
  private readonly directory: string;
  private readonly longTermFile: string;

  constructor(config: MemoryLogStoreConfig) {
    this.directory = toAbsolutePath(config.directory);
    this.longTermFile = toAbsolutePath(config.longTermFile);
    mkdirSync(this.directory, { recursive: true });
    mkdirSync(path.dirname(this.longTermFile), { recursive: true });
  }

  appendDaily(note: string, dateKey = currentDateKey()): string {
    const target = path.join(this.directory, `${dateKey}.md`);
    appendFileSync(target, `${note.trim()}\n\n`, "utf8");
    return target;
  }

  appendLongTerm(note: string): string {
    appendFileSync(this.longTermFile, `${note.trim()}\n\n`, "utf8");
    return this.longTermFile;
  }
}

