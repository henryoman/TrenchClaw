import {
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_LIST_DIRECTORY_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
} from "../workspace-bash";
import type { RuntimeReleaseReadinessDescriptor, WorkspaceToolCapabilityDefinition } from "./types";

const hasReadableWorkspaceSurface = ({
  filesystemPolicy,
}: Parameters<WorkspaceToolCapabilityDefinition["enabledBySettings"]>[0]): boolean =>
  filesystemPolicy.defaultPermission === "read"
  || filesystemPolicy.defaultPermission === "write"
  || filesystemPolicy.readPaths.length > 0
  || filesystemPolicy.writePaths.length > 0;

const hasWritableWorkspaceSurface = ({
  settings,
  filesystemPolicy,
}: Parameters<WorkspaceToolCapabilityDefinition["enabledBySettings"]>[0]): boolean =>
  settings.agent.dangerously.allowFilesystemWrites
  && (filesystemPolicy.defaultPermission === "write" || filesystemPolicy.writePaths.length > 0);

const SHIPPED_NOW = (note: string): RuntimeReleaseReadinessDescriptor => ({
  status: "shipped-now",
  note,
});

export const workspaceToolCapabilityDefinitions: readonly WorkspaceToolCapabilityDefinition[] = [
  {
    kind: "workspace-tool",
    name: WORKSPACE_LIST_DIRECTORY_TOOL_NAME,
    description: "Open a workspace directory and return exact workspace-relative child paths.",
    purpose: "Give the model a safe directory browser before it commits to an exact file path.",
    routingHint: "you need to open folders, inspect the workspace tree, or discover the exact file path before reading a file",
    sideEffectLevel: "read",
    tags: ["workspace", "filesystem", "read", "browse"],
    exampleInput: {
      path: ".",
      depth: 2,
    },
    releaseReadiness: SHIPPED_NOW("Runtime workspace tools ship in the current release when enabled by policy."),
    enabledBySettings: hasReadableWorkspaceSurface,
    chatExposed: true,
  },
  {
    kind: "workspace-tool",
    name: WORKSPACE_READ_FILE_TOOL_NAME,
    description: "Read one exact markdown, JSON, config, notes, or generated artifact file from the runtime workspace.",
    purpose: "Open a known workspace file directly once directory browsing or another tool already gave you the path.",
    routingHint: "you already know the exact runtime workspace path and need file contents instead of a directory listing or structured runtime data",
    sideEffectLevel: "read",
    tags: ["workspace", "filesystem", "read", "docs"],
    exampleInput: {
      path: "src/runtime/chat.ts",
    },
    releaseReadiness: SHIPPED_NOW("Runtime workspace tools ship in the current release when enabled by policy."),
    enabledBySettings: hasReadableWorkspaceSurface,
    chatExposed: true,
  },
  {
    kind: "workspace-tool",
    name: WORKSPACE_WRITE_FILE_TOOL_NAME,
    description: "Create or replace a file inside the runtime workspace writable roots.",
    purpose: "Make exact runtime workspace edits without relying on mutating shell commands.",
    routingHint: "you need to create or replace a runtime workspace file under notes, scratch, output, strategies, configs, or typescript",
    sideEffectLevel: "write",
    tags: ["workspace", "filesystem", "write", "edit"],
    exampleInput: {
      path: "notes/runtime.md",
      content: "# runtime notes",
    },
    releaseReadiness: SHIPPED_NOW("Runtime workspace tools ship in the current release when enabled by policy."),
    enabledBySettings: hasWritableWorkspaceSurface,
    chatExposed: true,
  },
  {
    kind: "workspace-tool",
    name: WORKSPACE_BASH_TOOL_NAME,
    description: "Run policy-constrained shell commands from the runtime workspace through a small typed JSON surface for CLI, search, directory, HTTP, or raw shell work.",
    purpose: "Use shell-native work such as `version`, `help`, `which`, `search_text`, `list_directory`, `http_get`, or raw `shell` only after simple directory or file tools are no longer enough.",
    routingHint: "you need a real shell command or CLI in the runtime workspace rather than simple folder browsing or exact file contents",
    sideEffectLevel: "read",
    tags: ["workspace", "shell", "search", "cli"],
    exampleInput: {
      type: "search_text",
      query: "wallet",
      path: "notes",
    },
    releaseReadiness: SHIPPED_NOW("Runtime workspace tools ship in the current release when enabled by policy."),
    enabledBySettings: hasReadableWorkspaceSurface,
    chatExposed: true,
  },
];
