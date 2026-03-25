import { mkdirSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RuntimeLogEntry } from "../logger";
import { assertRuntimeSystemWritePath } from "../security/write-scope";
import { resolveRuntimeContractPath } from "../runtime-paths";

export interface LiveLogStoreConfig {
  directory: string;
}

export interface SystemLogStoreConfig {
  directory: string;
}

export type RuntimeSummaryCategory = "runtime" | "trade" | "data";

export interface RuntimeSummaryEntry {
  timestamp: string;
  category: RuntimeSummaryCategory;
  event: string;
  details?: Record<string, unknown>;
}

export interface SummaryLogStoreConfig {
  directory: string;
}

export type LogIoOperation = "appendUtf8" | "writeUtf8";

export interface LogIoWriteEvent {
  ok: boolean;
  operation: LogIoOperation;
  filePath: string;
  bytes: number;
  error?: string;
}

export type LogIoWriteObserver = (event: LogIoWriteEvent) => void;

type StorageWriter = {
  appendUtf8: (filePath: string, content: string) => Promise<void>;
  writeUtf8: (filePath: string, content: string) => Promise<void>;
};

type RuntimeEventLogLine = {
  ts: string;
  product: "live" | "system";
  source: "runtime" | "system";
  level: RuntimeLogEntry["level"];
  kind: string;
  summary: string;
  details?: Record<string, unknown>;
};

type RuntimeSummaryJsonLine = {
  ts: string;
  product: "summary";
  source: "runtime" | "queue" | "chat" | "system";
  category: RuntimeSummaryCategory;
  kind: string;
  summary: string;
  details?: Record<string, unknown>;
};

interface DailyJsonlStoreConfig<Entry> {
  directory: string;
  initializeOperation: string;
  appendOperation: string;
  fileName: (entry: Entry) => string;
  serialize: (entry: Entry) => unknown;
}

let writeObserver: LogIoWriteObserver | null = null;

export const setLogIoWriteObserver = (observer: LogIoWriteObserver | null): void => {
  writeObserver = observer;
};

const performStorageWrite = async (
  operation: LogIoOperation,
  filePath: string,
  content: string,
): Promise<void> => {
  const bytes = Buffer.byteLength(content, "utf8");
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    if (operation === "appendUtf8") {
      await appendFile(filePath, content, "utf8");
    } else {
      await writeFile(filePath, content, "utf8");
    }
    writeObserver?.({
      ok: true,
      operation,
      filePath,
      bytes,
    });
  } catch (error) {
    writeObserver?.({
      ok: false,
      operation,
      filePath,
      bytes,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

const storageWriter: StorageWriter = {
  appendUtf8: async (filePath, content) => performStorageWrite("appendUtf8", filePath, content),
  writeUtf8: async (filePath, content) => performStorageWrite("writeUtf8", filePath, content),
};

export const resolveStoragePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : resolveRuntimeContractPath(targetPath);

export const resolveStorageChildPath = (directory: string, targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(directory, targetPath);

export const dateKeyFromIso = (timestampIso: string): string => timestampIso.slice(0, 10);

export const initializeStorageDirectory = (directory: string, operation: string): string => {
  const resolvedDirectory = resolveStoragePath(directory);
  assertRuntimeSystemWritePath(resolvedDirectory, operation);
  mkdirSync(resolvedDirectory, { recursive: true });
  return resolvedDirectory;
};

export const initializeStorageFilePath = (filePath: string, operation: string): string => {
  const resolvedFilePath = resolveStoragePath(filePath);
  assertRuntimeSystemWritePath(resolvedFilePath, operation);
  mkdirSync(path.dirname(resolvedFilePath), { recursive: true });
  return resolvedFilePath;
};

export const ensureWritableStoragePath = (filePath: string, operation: string): string => {
  const resolvedFilePath = resolveStoragePath(filePath);
  assertRuntimeSystemWritePath(resolvedFilePath, operation);
  return resolvedFilePath;
};

export const getStorageWriter = (): StorageWriter => storageWriter;

export const appendJsonLine = (
  writer: StorageWriter,
  filePath: string,
  value: unknown,
  operation: string,
): string => {
  const targetFilePath = ensureWritableStoragePath(filePath, operation);
  void writer.appendUtf8(targetFilePath, `${JSON.stringify(value)}\n`);
  return targetFilePath;
};

export const appendJsonLineAsync = async (
  writer: StorageWriter,
  filePath: string,
  value: unknown,
  operation: string,
): Promise<string> => {
  const targetFilePath = ensureWritableStoragePath(filePath, operation);
  await writer.appendUtf8(targetFilePath, `${JSON.stringify(value)}\n`);
  return targetFilePath;
};

export const appendText = (
  writer: StorageWriter,
  filePath: string,
  content: string,
  operation: string,
): string => {
  const targetFilePath = ensureWritableStoragePath(filePath, operation);
  void writer.appendUtf8(targetFilePath, content);
  return targetFilePath;
};

export const writeJsonFile = async (
  writer: StorageWriter,
  filePath: string,
  value: unknown,
  operation: string,
): Promise<string> => {
  const targetFilePath = ensureWritableStoragePath(filePath, operation);
  await writer.writeUtf8(targetFilePath, `${JSON.stringify(value, null, 2)}\n`);
  return targetFilePath;
};

const createDatedJsonlFileName = (timestampIso: string, suffix: string): string =>
  `${dateKeyFromIso(timestampIso)}.${suffix}.jsonl`;

class DailyJsonlStore<Entry> {
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

const createRuntimeEventStore = (config: {
  directory: string;
  initializeOperation: string;
  appendOperation: string;
  suffix: "console" | "system";
  product: RuntimeEventLogLine["product"];
  source: RuntimeEventLogLine["source"];
}): DailyJsonlStore<RuntimeLogEntry> =>
  new DailyJsonlStore({
    directory: config.directory,
    initializeOperation: config.initializeOperation,
    appendOperation: config.appendOperation,
    fileName: (entry) => createDatedJsonlFileName(entry.timestamp, config.suffix),
    serialize: (entry): RuntimeEventLogLine => ({
      ts: entry.timestamp,
      product: config.product,
      source: config.source,
      level: entry.level,
      kind: entry.event,
      summary: entry.event,
      ...(entry.details ? { details: entry.details } : {}),
    }),
  });

export class LiveLogStore {
  private readonly store: DailyJsonlStore<RuntimeLogEntry>;

  constructor(config: LiveLogStoreConfig) {
    this.store = createRuntimeEventStore({
      directory: config.directory,
      initializeOperation: "initialize live log directory",
      appendOperation: "append live log entry",
      suffix: "console",
      product: "live",
      source: "runtime",
    });
  }

  append(entry: RuntimeLogEntry): string {
    return this.store.append(entry);
  }
}

export class SystemLogStore {
  private readonly store: DailyJsonlStore<RuntimeLogEntry>;

  constructor(config: SystemLogStoreConfig) {
    this.store = createRuntimeEventStore({
      directory: config.directory,
      initializeOperation: "initialize system log directory",
      appendOperation: "append system log entry",
      suffix: "system",
      product: "system",
      source: "system",
    });
  }

  append(entry: RuntimeLogEntry): string {
    return this.store.append(entry);
  }
}

export class SummaryLogStore {
  private readonly store: DailyJsonlStore<RuntimeSummaryEntry>;

  constructor(config: SummaryLogStoreConfig) {
    this.store = new DailyJsonlStore({
      directory: config.directory,
      initializeOperation: "initialize summary log directory",
      appendOperation: "append runtime summary log entry",
      fileName: (entry) => createDatedJsonlFileName(entry.timestamp, "summary"),
      serialize: (entry): RuntimeSummaryJsonLine => ({
        ts: entry.timestamp,
        product: "summary",
        source: "runtime",
        category: entry.category,
        kind: entry.event,
        summary: entry.event,
        ...(entry.details ? { details: entry.details } : {}),
      }),
    });
  }

  append(entry: RuntimeSummaryEntry): string {
    return this.store.append(entry);
  }
}
