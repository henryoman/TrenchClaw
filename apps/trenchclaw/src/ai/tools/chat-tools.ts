import type { RuntimeSettings } from "../../runtime/load";
import {
  buildRuntimeChatToolNameCatalog as selectRuntimeChatToolNameCatalog,
  workspaceToolsEnabledByRuntimeSettings as selectWorkspaceToolsEnabledByRuntimeSettings,
} from "../../runtime/capabilities";
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
  selectWorkspaceToolsEnabledByRuntimeSettings({ settings });

export const buildRuntimeChatToolNameCatalog = (input: {
  actionNames?: string[];
  workspaceToolsEnabled?: boolean;
  settings?: RuntimeSettings;
}): string[] => {
  if (input.settings) {
    return selectRuntimeChatToolNameCatalog(input.settings);
  }

  return [
    ...(input.actionNames ?? []),
    ...((input.workspaceToolsEnabled ?? false) ? [...RUNTIME_WORKSPACE_TOOL_NAMES] : []),
  ].toSorted((leftToolName, rightToolName) => leftToolName.localeCompare(rightToolName));
};
