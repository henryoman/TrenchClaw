import type { RuntimeSettings } from "../../runtime/load";
import {
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
} from "../../runtime/workspace-bash";

export const RUNTIME_WORKSPACE_TOOL_NAMES = [
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
] as const;

export const workspaceToolsEnabledByRuntimeSettings = (settings: RuntimeSettings): boolean =>
  settings.agent.dangerously.allowFilesystemWrites;

export const buildRuntimeChatToolNameCatalog = (input: {
  actionNames: string[];
  workspaceToolsEnabled: boolean;
}): string[] =>
  [
    ...input.actionNames,
    ...(input.workspaceToolsEnabled ? [...RUNTIME_WORKSPACE_TOOL_NAMES] : []),
  ].toSorted((a, b) => a.localeCompare(b));
