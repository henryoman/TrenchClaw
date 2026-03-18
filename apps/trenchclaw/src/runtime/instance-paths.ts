import path from "node:path";

import { resolveInstanceDirectoryPath } from "./instance-state";
import { assertInstanceSystemWritePath } from "./security/write-scope";

const resolveInstanceChildPath = (instanceId: string, ...segments: string[]): string => {
  const resolvedPath = path.join(resolveInstanceDirectoryPath(instanceId), ...segments);
  assertInstanceSystemWritePath(resolvedPath, `resolve instance path ${segments.join("/")}`);
  return resolvedPath;
};

export const resolveInstanceSettingsRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "settings");

export const resolveInstanceDbRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "db");

export const resolveInstanceRuntimeSqlitePath = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "db", "runtime.sqlite");

export const resolveInstanceQueueSqlitePath = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "db", "queue.sqlite");

export const resolveInstanceSessionsRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "db", "sessions");

export const resolveInstanceMemoryRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "db", "memory");

export const resolveInstanceMemoryLongTermFilePath = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "db", "memory", "MEMORY.md");

export const resolveInstanceAiSettingsPath = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "settings", "ai.json");

export const resolveInstanceCompatibilitySettingsPath = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "settings", "settings.json");

export const resolveInstanceShellHomeRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "shell-home");

export const resolveInstanceTmpRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "tmp");

export const resolveInstanceToolBinRoot = (instanceId: string): string =>
  resolveInstanceChildPath(instanceId, "tool-bin");
