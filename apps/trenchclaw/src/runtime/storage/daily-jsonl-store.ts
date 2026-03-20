import path from "node:path";

import {
  appendJsonLine,
  dateKeyFromIso,
  getStorageWriter,
  initializeStorageDirectory,
  type StorageWriter,
} from "./storage-shared";

export interface DailyJsonlStoreConfig<Entry> {
  directory: string;
  initializeOperation: string;
  appendOperation: string;
  fileName: (entry: Entry) => string;
  serialize: (entry: Entry) => unknown;
}

export class DailyJsonlStore<Entry> {
  private readonly directory: string;
  private readonly appendOperation: string;
  private readonly fileName: (entry: Entry) => string;
  private readonly serialize: (entry: Entry) => unknown;
  private readonly writer: StorageWriter;

  constructor(config: DailyJsonlStoreConfig<Entry>) {
    this.directory = initializeStorageDirectory(config.directory, config.initializeOperation);
    this.appendOperation = config.appendOperation;
    this.fileName = config.fileName;
    this.serialize = config.serialize;
    this.writer = getStorageWriter();
  }

  append(entry: Entry): string {
    const filePath = path.join(this.directory, this.fileName(entry));
    return appendJsonLine(this.writer, filePath, this.serialize(entry), this.appendOperation);
  }
}

export const createDatedJsonlFileName = (timestampIso: string, suffix: string): string =>
  `${dateKeyFromIso(timestampIso)}.${suffix}.jsonl`;
