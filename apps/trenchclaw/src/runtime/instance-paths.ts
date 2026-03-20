import path from "node:path";

import { resolveInstanceDirectoryPath } from "./instance-state";
import { assertInstanceSystemWritePath } from "./security/write-scope";

const resolveInstanceChildPath = (instanceId: string, ...segments: string[]): string => {
  const resolvedPath = path.join(resolveInstanceDirectoryPath(instanceId), ...segments);
  assertInstanceSystemWritePath(resolvedPath, `resolve instance path ${segments.join("/")}`);
  return resolvedPath;
};

export const resolveInstanceSecretsRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "secrets");

export const resolveInstanceSettingsRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "settings");

export const resolveInstanceDataRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "data");

export const resolveInstanceRuntimeDbPath = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "data", "runtime.db");

export const resolveInstanceQueueSqlitePath = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "cache", "queue.sqlite");

export const resolveInstanceLogsRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "logs");

export const resolveInstanceLiveLogsRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "logs", "live");

export const resolveInstanceSessionsRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "logs", "sessions");

export const resolveInstanceSummariesRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "logs", "summaries");

export const resolveInstanceSystemLogsRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "logs", "system");

export const resolveInstanceCacheRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "cache");

export const resolveInstanceMemoryRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "cache", "memory");

export const resolveInstanceMemoryLongTermFilePath = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "cache", "memory", "MEMORY.md");

export const resolveInstanceAiSettingsPath = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "settings", "ai.json");

export const resolveInstanceCompatibilitySettingsPath = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "settings", "settings.json");

export const resolveInstanceTradingSettingsPath = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "settings", "trading.json");

export const resolveInstanceWakeupSettingsPath = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "settings", "wakeup.json");

export const resolveInstanceShellHomeRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "shell-home");

export const resolveInstanceTmpRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "tmp");

export const resolveInstanceToolBinRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "tool-bin");
