import path from "node:path";

import { resolveCurrentActiveInstanceIdSync, resolveInstanceDirectoryPath } from "./instance-state";
import { assertInstanceSystemWritePath } from "./security/write-scope";

export const INSTANCE_WORKSPACE_LAYOUT_DIRECTORIES = [
  "strategies",
  "configs",
  "typescript",
  "notes",
  "scratch",
  "output",
  "routines",
] as const;

export const resolveInstanceWorkspaceRoot = (instanceId: string): string => {
  const workspaceRoot = path.join(resolveInstanceDirectoryPath(instanceId), "workspace");
  assertInstanceSystemWritePath(workspaceRoot, "resolve instance workspace root");
  return workspaceRoot;
};

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
