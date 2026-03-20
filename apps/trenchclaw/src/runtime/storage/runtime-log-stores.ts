import type { RuntimeLogEntry } from "../logging/runtime-logger";
import { createDatedJsonlFileName, DailyJsonlStore } from "./daily-jsonl-store";

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
