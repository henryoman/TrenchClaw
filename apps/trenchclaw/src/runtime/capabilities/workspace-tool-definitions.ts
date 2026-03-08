import {
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
} from "../workspace-bash";
import type { WorkspaceToolCapabilityDefinition } from "./types";

export const workspaceToolsEnabledByRuntimeSettings = ({
  settings,
}: Parameters<WorkspaceToolCapabilityDefinition["enabledBySettings"]>[0]): boolean =>
  settings.agent.dangerously.allowFilesystemWrites;

export const workspaceToolCapabilityDefinitions: readonly WorkspaceToolCapabilityDefinition[] = [
  {
    kind: "workspace-tool",
    name: WORKSPACE_READ_FILE_TOOL_NAME,
    description: "Read local files from the allowed workspace roots.",
    purpose: "Inspect code, config, and generated artifacts inside the workspace contract.",
    tags: ["workspace", "filesystem", "read"],
    exampleInput: {
      path: "src/ai/brain/protected/system/system.md",
    },
    enabledBySettings: workspaceToolsEnabledByRuntimeSettings,
    chatExposed: true,
  },
  {
    kind: "workspace-tool",
    name: WORKSPACE_WRITE_FILE_TOOL_NAME,
    description: "Write or update files inside the allowed workspace roots.",
    purpose: "Make controlled edits without using ad hoc shell mutations.",
    tags: ["workspace", "filesystem", "write"],
    exampleInput: {
      path: "notes/runtime.md",
      content: "# runtime notes",
    },
    enabledBySettings: workspaceToolsEnabledByRuntimeSettings,
    chatExposed: true,
  },
  {
    kind: "workspace-tool",
    name: WORKSPACE_BASH_TOOL_NAME,
    description: "Run shell commands inside the workspace sandbox.",
    purpose: "Inspect project state or run safe local commands within the workspace contract.",
    tags: ["workspace", "shell"],
    exampleInput: {
      command: "bun test tests/ai/prompt-loader.test.ts",
    },
    enabledBySettings: workspaceToolsEnabledByRuntimeSettings,
    chatExposed: true,
  },
];
