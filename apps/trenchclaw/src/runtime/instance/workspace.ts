import path from "node:path";

import { resolveCurrentActiveInstanceIdSync, resolveInstanceDirectoryPath } from "./state";
import { assertInstanceSystemWritePath } from "../security/writeScope";
import { INSTANCE_WORKSPACE_LAYOUT_DIRECTORIES } from "./layoutSchema";

export { INSTANCE_WORKSPACE_LAYOUT_DIRECTORIES } from "./layoutSchema";

const resolveInstanceWorkspaceChildRoot = (instanceId: string, ...segments: string[]): string => {
  const childRoot = path.join(resolveInstanceWorkspaceRoot(instanceId), ...segments);
  assertInstanceSystemWritePath(childRoot, `resolve instance workspace path ${segments.join("/")}`);
  return childRoot;
};

export const resolveInstanceWorkspaceRoot = (instanceId: string): string => {
  const workspaceRoot = path.join(resolveInstanceDirectoryPath(instanceId), "workspace");
  assertInstanceSystemWritePath(workspaceRoot, "resolve instance workspace root");
  return workspaceRoot;
};

export const resolveInstanceWorkspaceNotesRoot = (instanceId: string): string =>
  resolveInstanceWorkspaceChildRoot(instanceId, "notes");

export const resolveInstanceWorkspaceConfigsRoot = (instanceId: string): string =>
  resolveInstanceWorkspaceChildRoot(instanceId, "configs");

export const resolveInstanceWorkspaceResearchNotesRoot = (instanceId: string): string =>
  resolveInstanceWorkspaceChildRoot(instanceId, "notes", "research");

export const resolveInstanceWorkspaceNewsRoot = (instanceId: string): string =>
  resolveInstanceWorkspaceChildRoot(instanceId, "news");

export const resolveInstanceWorkspaceNewsFeedRegistryPath = (instanceId: string): string =>
  path.join(resolveInstanceWorkspaceConfigsRoot(instanceId), "news-feeds.json");

export const resolveInstanceWorkspaceTrackerPath = (instanceId: string): string =>
  path.join(resolveInstanceWorkspaceConfigsRoot(instanceId), "tracker.json");

export const resolveInstanceWorkspaceOutputRoot = (instanceId: string): string =>
  resolveInstanceWorkspaceChildRoot(instanceId, "output");

export const resolveInstanceWorkspaceResearchOutputRoot = (instanceId: string): string =>
  resolveInstanceWorkspaceChildRoot(instanceId, "output", "research");

export const resolveInstanceWorkspaceMarketDataRoot = (instanceId: string): string =>
  resolveInstanceWorkspaceChildRoot(instanceId, "output", "research", "market-data");

export const resolveInstanceWorkspaceGeckoTerminalRoot = (instanceId: string): string =>
  resolveInstanceWorkspaceChildRoot(instanceId, "output", "research", "market-data", "geckoterminal");

export const resolveInstanceWorkspaceGeckoTerminalOhlcvRoot = (instanceId: string): string =>
  resolveInstanceWorkspaceChildRoot(instanceId, "output", "research", "market-data", "geckoterminal", "ohlcv");

export const resolveInstanceWorkspaceRoutinesRoot = (instanceId: string): string => {
  const routinesRoot = path.join(resolveInstanceWorkspaceRoot(instanceId), "routines");
  assertInstanceSystemWritePath(routinesRoot, "resolve instance workspace routines root");
  return routinesRoot;
};

export const resolveActiveInstanceWorkspaceRootSync = (): string | null => {
  const activeInstanceId = resolveCurrentActiveInstanceIdSync();
  return activeInstanceId ? resolveInstanceWorkspaceRoot(activeInstanceId) : null;
};

export const resolveActiveInstanceWorkspaceRootOrThrow = (): string => {
  const workspaceRoot = resolveActiveInstanceWorkspaceRootSync();
  if (!workspaceRoot) {
    throw new Error("No active instance selected. Workspace is instance-scoped.");
  }
  return workspaceRoot;
};

export const resolveActiveInstanceWorkspaceRoutinesRootOrThrow = (): string => {
  const activeInstanceId = resolveCurrentActiveInstanceIdSync();
  if (!activeInstanceId) {
    throw new Error("No active instance selected. Workspace routines are instance-scoped.");
  }
  return resolveInstanceWorkspaceRoutinesRoot(activeInstanceId);
};

export const resolveActiveInstanceWorkspaceResearchNotesRootOrThrow = (): string => {
  const activeInstanceId = resolveCurrentActiveInstanceIdSync();
  if (!activeInstanceId) {
    throw new Error("No active instance selected. Workspace research notes are instance-scoped.");
  }
  return resolveInstanceWorkspaceResearchNotesRoot(activeInstanceId);
};

export const resolveActiveInstanceWorkspaceNewsRootOrThrow = (): string => {
  const activeInstanceId = resolveCurrentActiveInstanceIdSync();
  if (!activeInstanceId) {
    throw new Error("No active instance selected. Workspace news is instance-scoped.");
  }
  return resolveInstanceWorkspaceNewsRoot(activeInstanceId);
};

export const resolveActiveInstanceWorkspaceGeckoTerminalOhlcvRootOrThrow = (): string => {
  const activeInstanceId = resolveCurrentActiveInstanceIdSync();
  if (!activeInstanceId) {
    throw new Error("No active instance selected. GeckoTerminal OHLC downloads are instance-scoped.");
  }
  return resolveInstanceWorkspaceGeckoTerminalOhlcvRoot(activeInstanceId);
};
