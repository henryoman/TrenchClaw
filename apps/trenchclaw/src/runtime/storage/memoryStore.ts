import path from "node:path";
import {
  appendText,
  getStorageWriter,
  initializeStorageDirectory,
  initializeStorageFilePath,
  resolveStorageChildPath,
} from "./logFiles";

export interface MemoryLogStoreConfig {
  directory: string;
  longTermFile: string;
}

const currentDateKey = (): string => new Date().toISOString().slice(0, 10);

export class MemoryLogStore {
  private readonly directory: string;
  private readonly longTermFile: string;
  private readonly writer = getStorageWriter();

  constructor(config: MemoryLogStoreConfig) {
    this.directory = initializeStorageDirectory(config.directory, "initialize memory log directory");
    this.longTermFile = initializeStorageFilePath(
      resolveStorageChildPath(this.directory, config.longTermFile),
      "initialize long-term memory log file",
    );
  }

  appendDaily(note: string, dateKey = currentDateKey()): string {
    const target = path.join(this.directory, `${dateKey}.md`);
    return appendText(this.writer, target, `${note.trim()}\n\n`, "append daily memory note");
  }

  appendLongTerm(note: string): string {
    return appendText(this.writer, this.longTermFile, `${note.trim()}\n\n`, "append long-term memory note");
  }
}
