import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBashTool } from "bash-tool";

import {
  FilesystemPermissionDeniedError,
  assertModelFilesystemReadAllowed,
  assertModelFilesystemWriteAllowed,
} from "./security/filesystem-manifest";

interface WorkspaceBashOptions {
  workspaceRootDirectory: string;
  actor?: "agent" | "user" | "system";
  commandTimeoutMs?: number;
  allowMutatingCommands?: boolean;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const MAX_COMMAND_LENGTH = 8_000;
const DEFAULT_ALLOW_MUTATING_COMMANDS = (process.env.TRENCHCLAW_WORKSPACE_BASH_ALLOW_MUTATIONS ?? "0") === "1";

export const WORKSPACE_LAYOUT_DIRECTORIES = [
  "strategies",
  "configs",
  "typescript",
  "notes",
  "scratch",
  "output",
] as const;

const DANGEROUS_COMMAND_PATTERNS: RegExp[] = [
  /\bsudo\b/iu,
  /\brm\s+-rf\s+\/\b/iu,
  /\bmkfs\b/iu,
  /\bdd\s+if=/iu,
  /\bshutdown\b/iu,
  /\breboot\b/iu,
];

const MUTATING_COMMAND_PATTERNS: RegExp[] = [
  /(^|[^0-9<])>>?/u,
  /\btee\b/iu,
  /\btouch\b/iu,
  /\bmkdir\b/iu,
  /\bcp\b/iu,
  /\bmv\b/iu,
  /\brm\b/iu,
  /\btruncate\b/iu,
  /\bsed\s+-i\b/iu,
  /\bperl\s+-i\b/iu,
  /\bbun\s+install\b/iu,
  /\bnpm\s+install\b/iu,
  /\bpnpm\s+install\b/iu,
  /\byarn\s+add\b/iu,
];

const assertWorkspacePath = (workspaceRoot: string, targetPath: string): string => {
  const resolvedPath = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(workspaceRoot, targetPath);
  const normalizedRoot = path.resolve(workspaceRoot);
  if (resolvedPath !== normalizedRoot && !resolvedPath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new FilesystemPermissionDeniedError(
      `Path "${targetPath}" resolves outside workspace root "${normalizedRoot}"`,
    );
  }
  return resolvedPath;
};

const sanitizeCommand = (command: string): string => {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error("Command must be a non-empty string");
  }
  if (trimmed.length > MAX_COMMAND_LENGTH) {
    throw new Error(`Command exceeds maximum length (${MAX_COMMAND_LENGTH})`);
  }
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new Error(`Blocked potentially destructive command pattern: ${pattern}`);
    }
  }
  return trimmed;
};

const isMutatingCommand = (command: string): boolean =>
  MUTATING_COMMAND_PATTERNS.some((pattern) => pattern.test(command));

class HostWorkspaceSandbox {
  private readonly workspaceRoot: string;
  private readonly actor: "agent" | "user" | "system";
  private readonly commandTimeoutMs: number;
  private readonly allowMutatingCommands: boolean;

  constructor(options: WorkspaceBashOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRootDirectory);
    this.actor = options.actor ?? "agent";
    this.commandTimeoutMs = Math.max(1_000, Math.trunc(options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS));
    this.allowMutatingCommands = options.allowMutatingCommands ?? DEFAULT_ALLOW_MUTATING_COMMANDS;
  }

  async executeCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const sanitizedCommand = sanitizeCommand(command);
    const mutatingCommand = isMutatingCommand(sanitizedCommand);
    if (mutatingCommand && !this.allowMutatingCommands) {
      throw new Error(
        "Mutating shell commands are disabled. Use workspaceWriteFile for file writes, or enable TRENCHCLAW_WORKSPACE_BASH_ALLOW_MUTATIONS=1 for trusted sessions.",
      );
    }
    if (mutatingCommand) {
      await assertModelFilesystemWriteAllowed({
        actor: this.actor,
        targetPath: this.workspaceRoot,
        reason: "execute workspace bash command",
      });
    } else {
      await assertModelFilesystemReadAllowed({
        actor: this.actor,
        targetPath: this.workspaceRoot,
        reason: "execute workspace bash command",
      });
    }

    await mkdir(this.workspaceRoot, { recursive: true });
    const child = Bun.spawn(["bash", "-lc", sanitizedCommand], {
      cwd: this.workspaceRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${this.commandTimeoutMs}ms`));
      }, this.commandTimeoutMs);
    });

    try {
      const [exitCode, stdout, stderr] = await Promise.race([
        Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]),
        timeoutPromise,
      ]);
      return {
        stdout,
        stderr,
        exitCode: typeof exitCode === "number" ? exitCode : 1,
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async readFile(filePath: string): Promise<string> {
    const absolutePath = assertWorkspacePath(this.workspaceRoot, filePath);
    await assertModelFilesystemReadAllowed({
      actor: this.actor,
      targetPath: absolutePath,
      reason: "read workspace file",
    });
    return readFile(absolutePath, "utf8");
  }

  async writeFiles(files: Array<{ path: string; content: string | Buffer }>): Promise<void> {
    for (const file of files) {
      const absolutePath = assertWorkspacePath(this.workspaceRoot, file.path);
      await assertModelFilesystemWriteAllowed({
        actor: this.actor,
        targetPath: absolutePath,
        reason: "write workspace file",
      });
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, file.content);
    }
  }
}

export const WORKSPACE_BASH_TOOL_NAME = "workspaceBash";
export const WORKSPACE_READ_FILE_TOOL_NAME = "workspaceReadFile";
export const WORKSPACE_WRITE_FILE_TOOL_NAME = "workspaceWriteFile";

export const createWorkspaceBashTools = async (options: WorkspaceBashOptions): Promise<Record<string, unknown>> => {
  const workspaceRootDirectory = path.resolve(options.workspaceRootDirectory);
  await mkdir(workspaceRootDirectory, { recursive: true });
  await Promise.all(
    WORKSPACE_LAYOUT_DIRECTORIES.map((directory) =>
      mkdir(path.join(workspaceRootDirectory, directory), { recursive: true }),
    ),
  );

  const toolkit = await createBashTool({
    sandbox: new HostWorkspaceSandbox({
      ...options,
      workspaceRootDirectory,
    }),
    destination: workspaceRootDirectory,
    extraInstructions: [
      `Only access files under ${workspaceRootDirectory}.`,
      `Primary writable directories: ${WORKSPACE_LAYOUT_DIRECTORIES.join(", ")}.`,
      "Prefer workspaceWriteFile for creating/updating files; use workspaceBash for discovery, search, and read-only execution.",
    ].join(" "),
    onBeforeBashCall: ({ command }) => ({
      command: sanitizeCommand(command),
    }),
  });

  return {
    [WORKSPACE_BASH_TOOL_NAME]: toolkit.tools.bash,
    [WORKSPACE_READ_FILE_TOOL_NAME]: toolkit.tools.readFile,
    [WORKSPACE_WRITE_FILE_TOOL_NAME]: toolkit.tools.writeFile,
  };
};
