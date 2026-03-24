import type { RuntimeSettings } from "../settings";
import { isRecord } from "../shared/object-utils";

type RuntimeLogLevel = RuntimeSettings["observability"]["logging"]["level"];
type RuntimeLogStyle = RuntimeSettings["observability"]["logging"]["style"];

const LOG_LEVEL_WEIGHT: Record<RuntimeLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const stringifyJsonSafe = (value: unknown, space?: number): string => JSON.stringify(
  value,
  (_key, nestedValue) => (typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue),
  space,
);

const stringifyValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return String(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  try {
    return stringifyJsonSafe(value);
  } catch {
    return "[unserializable]";
  }
};

export interface RuntimeLoggerConfig {
  level: RuntimeLogLevel;
  style: RuntimeLogStyle;
  pretty: boolean;
}

export interface RuntimeLogEntry {
  timestamp: string;
  level: RuntimeLogLevel;
  event: string;
  details?: Record<string, unknown>;
}

export type RuntimeLogListener = (entry: RuntimeLogEntry) => void;

export class RuntimeLogger {
  private readonly config: RuntimeLoggerConfig;
  private readonly listeners = new Set<RuntimeLogListener>();

  constructor(config: RuntimeLoggerConfig) {
    this.config = config;
  }

  isEnabled(level: RuntimeLogLevel): boolean {
    return LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[this.config.level];
  }

  log(level: RuntimeLogLevel, event: string, details?: Record<string, unknown>): void {
    if (!this.isEnabled(level)) {
      return;
    }

    const entry: RuntimeLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...(details && Object.keys(details).length > 0 ? { details } : {}),
    };

    if (this.config.style === "json") {
      this.logJson(entry);
    } else {
      this.logHuman(entry);
    }
    this.broadcast(entry);
  }

  debug(event: string, details?: Record<string, unknown>): void {
    this.log("debug", event, details);
  }

  info(event: string, details?: Record<string, unknown>): void {
    this.log("info", event, details);
  }

  warn(event: string, details?: Record<string, unknown>): void {
    this.log("warn", event, details);
  }

  error(event: string, details?: Record<string, unknown>): void {
    this.log("error", event, details);
  }

  subscribe(listener: RuntimeLogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private logHuman(entry: RuntimeLogEntry): void {
    const prefix = `[${entry.level}] [${entry.event}]`;
    const details = entry.details;
    if (!details || Object.keys(details).length === 0) {
      console.log(prefix);
      return;
    }

    const serialized = Object.entries(details).map(([key, value]) => `${key}=${stringifyValue(value)}`);
    console.log(prefix, ...serialized);
  }

  private logJson(entry: RuntimeLogEntry): void {
    const payload: Record<string, unknown> = { ...entry };
    if (entry.details && !(isRecord(entry.details) && Object.keys(entry.details).length > 0)) {
      delete payload.details;
    }

    if (this.config.pretty) {
      console.log(stringifyJsonSafe(payload, 2));
      return;
    }

    console.log(stringifyJsonSafe(payload));
  }

  private broadcast(entry: RuntimeLogEntry): void {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[runtime-logger] listener threw", { error: message });
      }
    }
  }
}

export const createRuntimeLogger = (settings: RuntimeSettings): RuntimeLogger =>
  new RuntimeLogger({
    level: settings.observability.logging.level,
    style: settings.observability.logging.style,
    pretty: settings.observability.logging.pretty,
  });
