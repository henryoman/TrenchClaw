import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBashTool } from "bash-tool";

import {
  FilesystemPermissionDeniedError,
  assertFilesystemAccessAllowed,
} from "./security/filesystem-manifest";

interface WorkspaceBashOptions {
  workspaceRootDirectory: string;
  actor?: "agent" | "user" | "system";
  commandTimeoutMs?: number;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const MAX_COMMAND_LENGTH = 8_000;

const DANGEROUS_COMMAND_PATTERNS: RegExp[] = [
  /\bsudo\b/iu,
  /\brm\s+-rf\s+\/\b/iu,
  /\bmkfs\b/iu,
  /\bdd\s+if=/iu,
  /\bshutdown\b/iu,
  /\breboot\b/iu,
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

class HostWorkspaceSandbox {
  private readonly workspaceRoot: string;
  private readonly actor: "agent" | "user" | "system";
  private readonly commandTimeoutMs: number;

  constructor(options: WorkspaceBashOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRootDirectory);
    this.actor = options.actor ?? "agent";
    this.commandTimeoutMs = Math.max(1_000, Math.trunc(options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS));
  }

  async executeCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const sanitizedCommand = sanitizeCommand(command);
    await assertFilesystemAccessAllowed({
      actor: this.actor,
      targetPath: this.workspaceRoot,
      operation: "write",
      reason: "execute workspace bash command",
    });

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
    await assertFilesystemAccessAllowed({
      actor: this.actor,
      targetPath: absolutePath,
      operation: "read",
      reason: "read workspace file",
    });
    return readFile(absolutePath, "utf8");
  }

  async writeFiles(files: Array<{ path: string; content: string | Buffer }>): Promise<void> {
    for (const file of files) {
      const absolutePath = assertWorkspacePath(this.workspaceRoot, file.path);
      await assertFilesystemAccessAllowed({
        actor: this.actor,
        targetPath: absolutePath,
        operation: "write",
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

  const toolkit = await createBashTool({
    sandbox: new HostWorkspaceSandbox({
      ...options,
      workspaceRootDirectory,
    }),
    destination: workspaceRootDirectory,
    extraInstructions: `Only access files under ${workspaceRootDirectory}.`,
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
