import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBashTool } from "bash-tool";
import { tool } from "ai";

import {
  FilesystemPermissionDeniedError,
  assertModelFilesystemReadAllowed,
  assertModelFilesystemWriteAllowed,
} from "./security/filesystem-manifest";
import { CORE_APP_ROOT, RUNTIME_WORKSPACE_ROOT } from "./runtime-paths";

interface WorkspaceBashOptions {
  workspaceRootDirectory: string;
  readRootDirectory?: string;
  writeRootDirectory?: string;
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
  /(^|[\s"'`])\.\.(\/|$)/u,
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

const BLOCKED_DIRECT_FILE_PATTERNS: RegExp[] = [
  /\/\.runtime-state\/instances\/[^/]+\/vault\.json$/u,
  /\/\.runtime-state\/instances\/[^/]+\/keypairs(\/|$)/u,
];

const assertWithinRoot = (rootDirectory: string, targetPath: string): string => {
  const resolvedPath = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(rootDirectory, targetPath);
  const normalizedRoot = path.resolve(rootDirectory);
  if (resolvedPath !== normalizedRoot && !resolvedPath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new FilesystemPermissionDeniedError(
      `Path "${targetPath}" resolves outside allowed root "${normalizedRoot}"`,
    );
  }
  return resolvedPath;
};

const assertDirectFilePathAllowed = (targetPath: string): void => {
  const normalized = path.resolve(targetPath).replaceAll(path.sep, "/");
  for (const pattern of BLOCKED_DIRECT_FILE_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new FilesystemPermissionDeniedError(
        `Direct file tools cannot access protected secret or key material at "${normalized}"`,
      );
    }
  }
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
      throw new Error(`Blocked unsafe command pattern: ${pattern}`);
    }
  }
  return trimmed;
};

const isMutatingCommand = (command: string): boolean =>
  MUTATING_COMMAND_PATTERNS.some((pattern) => pattern.test(command));

class HostWorkspaceSandbox {
  private readonly bashRoot: string;
  private readonly readRoot: string;
  private readonly writeRoot: string;
  private readonly actor: "agent" | "user" | "system";
  private readonly commandTimeoutMs: number;
  private readonly allowMutatingCommands: boolean;

  constructor(options: WorkspaceBashOptions) {
    this.bashRoot = path.resolve(options.workspaceRootDirectory);
    this.readRoot = path.resolve(options.readRootDirectory ?? CORE_APP_ROOT);
    this.writeRoot = path.resolve(options.writeRootDirectory ?? options.workspaceRootDirectory);
    this.actor = options.actor ?? "agent";
    this.commandTimeoutMs = Math.max(1_000, Math.trunc(options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS));
    this.allowMutatingCommands = options.allowMutatingCommands ?? DEFAULT_ALLOW_MUTATING_COMMANDS;
  }

  async executeCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const sanitizedCommand = sanitizeCommand(command);
    const mutatingCommand = isMutatingCommand(sanitizedCommand);
    if (mutatingCommand && !this.allowMutatingCommands) {
      throw new Error(
        "Mutating shell commands are disabled. Use workspaceWriteFile for file writes inside the runtime workspace.",
      );
    }

    await assertModelFilesystemReadAllowed({
      actor: this.actor,
      targetPath: this.bashRoot,
      reason: "execute workspace bash command",
    });

    await mkdir(this.bashRoot, { recursive: true });
    const child = Bun.spawn(["bash", "-lc", sanitizedCommand], {
      cwd: this.bashRoot,
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
    const absolutePath = assertWithinRoot(this.readRoot, filePath);
    assertDirectFilePathAllowed(absolutePath);
    await assertModelFilesystemReadAllowed({
      actor: this.actor,
      targetPath: absolutePath,
      reason: "read workspace file",
    });
    return readFile(absolutePath, "utf8");
  }

  async writeFiles(files: Array<{ path: string; content: string | Buffer }>): Promise<void> {
    await Promise.all(files.map(async (file) => {
      const absolutePath = assertWithinRoot(this.writeRoot, file.path);
      await assertModelFilesystemWriteAllowed({
        actor: this.actor,
        targetPath: absolutePath,
        reason: "write workspace file",
      });
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, file.content);
    }));
  }
}

const wrapTool = (input: {
  description: string;
  rawTool: { inputSchema: unknown; execute: (payload: unknown) => Promise<unknown> };
}) =>
  tool({
    description: input.description,
    inputSchema: input.rawTool.inputSchema as never,
    execute: input.rawTool.execute as never,
  });

export const WORKSPACE_BASH_TOOL_NAME = "workspaceBash";
export const WORKSPACE_READ_FILE_TOOL_NAME = "workspaceReadFile";
export const WORKSPACE_WRITE_FILE_TOOL_NAME = "workspaceWriteFile";

export const createWorkspaceBashTools = async (options: WorkspaceBashOptions): Promise<Record<string, unknown>> => {
  const bashRootDirectory = path.resolve(options.workspaceRootDirectory);
  const writeRootDirectory = path.resolve(options.writeRootDirectory ?? options.workspaceRootDirectory);
  await mkdir(bashRootDirectory, { recursive: true });
  await mkdir(writeRootDirectory, { recursive: true });
  await Promise.all(
    WORKSPACE_LAYOUT_DIRECTORIES.map((directory) =>
      mkdir(path.join(writeRootDirectory, directory), { recursive: true }),
    ),
  );

  const toolkit = await createBashTool({
    sandbox: new HostWorkspaceSandbox({
      ...options,
      workspaceRootDirectory: bashRootDirectory,
      writeRootDirectory,
    }),
    destination: bashRootDirectory,
    extraInstructions: [
      `Only run commands from ${bashRootDirectory}.`,
      "Do not use parent traversal or absolute paths.",
      "Use workspaceBash only for simple local inspection inside the runtime workspace.",
      "Use workspaceReadFile for exact source, doc, config, or generated-artifact reads.",
      "Use workspaceWriteFile for exact runtime workspace edits.",
    ].join(" "),
    onBeforeBashCall: ({ command }) => ({
      command: sanitizeCommand(command),
    }),
  });

  const rawBashTool = toolkit.tools.bash as { inputSchema: unknown; execute: (payload: unknown) => Promise<unknown> };
  const rawReadTool = toolkit.tools.readFile as { inputSchema: unknown; execute: (payload: unknown) => Promise<unknown> };
  const rawWriteTool = toolkit.tools.writeFile as { inputSchema: unknown; execute: (payload: unknown) => Promise<unknown> };
  const writableSession = (options.allowMutatingCommands ?? DEFAULT_ALLOW_MUTATING_COMMANDS) ? "writable" : "read-only";

  return {
    [WORKSPACE_BASH_TOOL_NAME]: wrapTool({
      description:
        `Run safe shell commands from the runtime workspace root ${bashRootDirectory}. This session is ${writableSession}. ` +
        "Prefer this for simple local inspection commands like `pwd`, `ls`, `find`, or `rg` that stay inside the runtime workspace.",
      rawTool: rawBashTool,
    }),
    [WORKSPACE_READ_FILE_TOOL_NAME]: wrapTool({
      description:
        `Read an exact file from the core app workspace rooted at ${path.resolve(options.readRootDirectory ?? CORE_APP_ROOT)}. ` +
        "Prefer this when you already know the file path and need source, docs, config, or generated artifact contents. " +
        "Protected vault and keypair files are blocked from direct reads.",
      rawTool: rawReadTool,
    }),
    [WORKSPACE_WRITE_FILE_TOOL_NAME]: wrapTool({
      description:
        `Create or replace a file inside the runtime workspace root ${writeRootDirectory}. ` +
        "Prefer this over mutating shell commands for notes, scratch files, output, and other runtime workspace artifacts.",
      rawTool: rawWriteTool,
    }),
  };
};

export const DEFAULT_WORKSPACE_BASH_ROOT = RUNTIME_WORKSPACE_ROOT;
