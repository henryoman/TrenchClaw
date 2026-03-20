import {
  WORKSPACE_BASH_TOOL_NAME,
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
    name: WORKSPACE_READ_FILE_TOOL_NAME,
    description: "Read an exact markdown, JSON, config, or generated artifact file from the runtime workspace only.",
    purpose: "Open a known runtime workspace file path directly when you need file contents instead of structured runtime data.",
    routingHint: "you already know the runtime workspace file path and need its file contents, especially for notes, configs, scratch files, or generated artifacts",
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
    description: "Run safe shell commands from the runtime workspace for local inspection and utility tasks.",
    purpose: "Use simple read-only commands like `pwd`, `ls`, `find`, and `rg` inside the runtime workspace.",
    routingHint: "you need a simple local shell command in the runtime workspace and do not need direct file contents",
    sideEffectLevel: "read",
    tags: ["workspace", "shell", "search", "cli"],
    exampleInput: {
      command: "find . -maxdepth 2 -type f",
    },
    releaseReadiness: SHIPPED_NOW("Runtime workspace tools ship in the current release when enabled by policy."),
    enabledBySettings: hasReadableWorkspaceSurface,
    chatExposed: true,
  },
];
