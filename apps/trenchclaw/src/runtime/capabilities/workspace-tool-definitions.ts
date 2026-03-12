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
    description: "Open a specific workspace file such as source code, markdown docs, JSON, configs, or generated artifacts.",
    purpose: "Read exact file contents after you already know the path, especially for docs and source inspection.",
    tags: ["workspace", "filesystem", "read", "docs"],
    exampleInput: {
      path: ".runtime-state/generated/knowledge-manifest.md",
    },
    enabledBySettings: workspaceToolsEnabledByRuntimeSettings,
    chatExposed: true,
  },
  {
    kind: "workspace-tool",
    name: WORKSPACE_WRITE_FILE_TOOL_NAME,
    description: "Create or replace a workspace file inside the allowed writable roots.",
    purpose: "Make controlled file edits instead of using shell redirection or other mutating bash commands.",
    tags: ["workspace", "filesystem", "write", "edit"],
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
    description: "Run sandboxed workspace shell commands for discovery, search, and safe local execution.",
    purpose: "Use `ls`, `rg`, `bun test`, `bun run`, and similar commands to discover files, inspect docs, or run local read-only workflows.",
    tags: ["workspace", "shell", "search", "cli"],
    exampleInput: {
      command: "rg \"workspaceBash|workspaceReadFile|workspaceWriteFile\" src tests",
    },
    enabledBySettings: workspaceToolsEnabledByRuntimeSettings,
    chatExposed: true,
  },
];
