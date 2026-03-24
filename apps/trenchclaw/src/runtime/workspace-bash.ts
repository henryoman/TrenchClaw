import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBashTool } from "bash-tool";
import { tool } from "ai";
import { z } from "zod";

import {
  FilesystemPermissionDeniedError,
  assertModelFilesystemReadAllowed,
  assertModelFilesystemWriteAllowed,
} from "./security/filesystem-manifest";
import {
  INSTANCE_WORKSPACE_LAYOUT_DIRECTORIES,
  resolveActiveInstanceWorkspaceRootOrThrow,
} from "./instance/workspace";
import { resolveCurrentActiveInstanceIdSync } from "./instance/state";
import {
  resolveInstanceShellHomeRoot,
  resolveInstanceTmpRoot,
  resolveInstanceToolBinRoot,
} from "./instance/paths";
import { RUNTIME_INSTANCE_ROOT } from "./runtime-paths";
import { getModelToolEnvelopeSchema, MACHINE_TOOL_ENVELOPE_NOTE } from "./chat/model-tool-language";

interface WorkspaceBashOptions {
  workspaceRootDirectory: string;
  readRootDirectory?: string;
  writeRootDirectory?: string;
  shellHomeDirectory?: string;
  tmpDirectory?: string;
  toolBinDirectory?: string;
  actor?: "agent" | "user" | "system";
  commandTimeoutMs?: number;
  allowMutatingCommands?: boolean;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const MAX_COMMAND_LENGTH = 8_000;
const DEFAULT_ALLOW_MUTATING_COMMANDS = (process.env.TRENCHCLAW_WORKSPACE_BASH_ALLOW_MUTATIONS ?? "0") === "1";
const BASH_EXECUTABLE = process.platform === "win32" ? "bash" : "/bin/bash";
const SAFE_SYSTEM_PATH_ENTRIES = [
  path.dirname(process.execPath),
  process.platform === "darwin" ? "/opt/homebrew/bin" : null,
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
].filter((entry): entry is string => typeof entry === "string" && entry.length > 0);

export const WORKSPACE_LAYOUT_DIRECTORIES = INSTANCE_WORKSPACE_LAYOUT_DIRECTORIES;

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
const DEFAULT_DIRECTORY_LIST_DEPTH = 2;
const MAX_DIRECTORY_LIST_DEPTH = 6;
const DEFAULT_DIRECTORY_LIST_LIMIT = 200;
const MAX_DIRECTORY_LIST_LIMIT = 1_000;

const listWorkspaceDirectoryInputSchema = z.object({
  path: z.string().trim().min(1).default("."),
  depth: z.number().int().min(0).max(MAX_DIRECTORY_LIST_DEPTH).default(DEFAULT_DIRECTORY_LIST_DEPTH),
  limit: z.number().int().min(1).max(MAX_DIRECTORY_LIST_LIMIT).default(DEFAULT_DIRECTORY_LIST_LIMIT),
  includeHidden: z.boolean().default(false),
});

const workspaceReadFileInputSchema = z.object({
  path: z.string().trim().min(1),
});

const workspaceWriteFileInputSchema = z.object({
  path: z.string().trim().min(1),
  content: z.string(),
});

const WORKSPACE_BASH_MODE_VALUES = [
  "shell",
  "cli",
  "version",
  "help",
  "which",
  "search_text",
  "list_directory",
  "http_get",
] as const;

const workspaceBashModeSchema = z.enum(WORKSPACE_BASH_MODE_VALUES);

const workspaceBashInputSchema = z.object({
  type: workspaceBashModeSchema,
  command: z.string().trim().min(1).optional(),
  program: z.string().trim().min(1).optional(),
  args: z.array(z.string().trim().min(1)).max(64).optional(),
  subcommand: z.string().trim().min(1).optional(),
  path: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).optional(),
  url: z.string().trim().url().optional(),
  includeHidden: z.boolean().optional(),
}).superRefine((input, ctx) => {
  switch (input.type) {
    case "shell":
      if (!input.command) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command"],
          message: "`type: \"shell\"` requires `command`.",
        });
      }
      return;
    case "cli":
    case "version":
    case "help":
    case "which":
      if (!input.program) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["program"],
          message: `\`type: "${input.type}"\` requires \`program\`.`,
        });
      }
      return;
    case "search_text":
      if (!input.query) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["query"],
          message: "`type: \"search_text\"` requires `query`.",
        });
      }
      return;
    case "http_get":
      if (!input.url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "`type: \"http_get\"` requires `url`.",
        });
      }
      return;
    case "list_directory":
      return;
  }
});

type WorkspaceBashInput = z.output<typeof workspaceBashInputSchema>;
type WorkspaceBashMode = z.infer<typeof workspaceBashModeSchema>;

type WorkspaceDirectoryListResult = {
  directory: string;
  entries: Array<{
    path: string;
    type: "directory" | "file" | "symlink" | "other";
  }>;
  truncated: boolean;
};

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
  if (isDirectFilePathAllowed(targetPath)) {
    return;
  }
  const normalized = path.resolve(targetPath).replaceAll(path.sep, "/");
  throw new FilesystemPermissionDeniedError(
    `Direct file tools cannot access protected secret or key material at "${normalized}"`,
  );
};

const isDirectFilePathAllowed = (targetPath: string): boolean => {
  const normalized = path.resolve(targetPath).replaceAll(path.sep, "/");
  for (const pattern of BLOCKED_DIRECT_FILE_PATTERNS) {
    if (pattern.test(normalized)) {
      return false;
    }
  }
  return true;
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

const shellQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

const buildCliInvocation = (program: string, args: readonly string[] = []): string =>
  [program, ...args].map(shellQuote).join(" ");

const resolveWorkspaceBashCommand = (input: WorkspaceBashInput): string => {
  const mode: WorkspaceBashMode = input.type;

  switch (mode) {
    case "shell":
      return input.command ?? "";
    case "cli":
      return buildCliInvocation(input.program ?? "", input.args ?? []);
    case "version":
      return buildCliInvocation(input.program ?? "", ["--version"]);
    case "help":
      return buildCliInvocation(
        input.program ?? "",
        [...(input.subcommand ? [input.subcommand] : []), "--help"],
      );
    case "which":
      return `command -v ${shellQuote(input.program ?? "")}`;
    case "search_text":
      return `rg --line-number --no-heading${input.includeHidden ? " --hidden" : ""} ${shellQuote(input.query ?? "")} ${shellQuote(input.path ?? ".")}`;
    case "list_directory":
      return `ls ${input.includeHidden ? "-la" : "-l"} ${shellQuote(input.path ?? ".")}`;
    case "http_get":
      return `curl -fsSL ${shellQuote(input.url ?? "")}`;
  }
};

const isMutatingCommand = (command: string): boolean =>
  MUTATING_COMMAND_PATTERNS.some((pattern) => pattern.test(command));

const toWorkspaceRelativePath = (rootDirectory: string, targetPath: string): string => {
  const relativePath = path.relative(rootDirectory, targetPath).replaceAll(path.sep, "/");
  return relativePath.length > 0 ? relativePath : ".";
};

const compareDirectoryEntries = (left: Dirent, right: Dirent): number => {
  const leftRank = left.isDirectory() ? 0 : 1;
  const rightRank = right.isDirectory() ? 0 : 1;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return left.name.localeCompare(right.name);
};

const toDirectoryEntryType = (entry: Dirent): WorkspaceDirectoryListResult["entries"][number]["type"] => {
  if (entry.isDirectory()) {
    return "directory";
  }
  if (entry.isFile()) {
    return "file";
  }
  if (entry.isSymbolicLink()) {
    return "symlink";
  }
  return "other";
};

const resolveInstanceIdFromWorkspaceRoot = (workspaceRootDirectory: string): string | null => {
  const activeInstanceId = resolveCurrentActiveInstanceIdSync();
  if (activeInstanceId) {
    return activeInstanceId;
  }

  const relativeToInstancesRoot = path.relative(RUNTIME_INSTANCE_ROOT, path.resolve(workspaceRootDirectory));
  if (
    !relativeToInstancesRoot
    || relativeToInstancesRoot.startsWith("..")
    || path.isAbsolute(relativeToInstancesRoot)
  ) {
    return null;
  }

  const [instanceId, firstChildDirectory] = relativeToInstancesRoot.split(path.sep);
  if (!instanceId || firstChildDirectory !== "workspace" || !/^\d{2}$/u.test(instanceId)) {
    return null;
  }
  return instanceId;
};

const resolveWorkspaceSandboxDirectories = (options: WorkspaceBashOptions): {
  shellHomeDirectory: string;
  tmpDirectory: string;
  toolBinDirectory: string;
} => {
  const shellHomeDirectory = options.shellHomeDirectory?.trim();
  const tmpDirectory = options.tmpDirectory?.trim();
  const toolBinDirectory = options.toolBinDirectory?.trim();
  if (shellHomeDirectory && tmpDirectory && toolBinDirectory) {
    return {
      shellHomeDirectory: path.resolve(shellHomeDirectory),
      tmpDirectory: path.resolve(tmpDirectory),
      toolBinDirectory: path.resolve(toolBinDirectory),
    };
  }

  const instanceId = resolveInstanceIdFromWorkspaceRoot(options.workspaceRootDirectory);
  if (instanceId) {
    return {
      shellHomeDirectory: resolveInstanceShellHomeRoot(instanceId),
      tmpDirectory: resolveInstanceTmpRoot(instanceId),
      toolBinDirectory: resolveInstanceToolBinRoot(instanceId),
    };
  }

  const workspaceRoot = path.resolve(options.workspaceRootDirectory);
  return {
    shellHomeDirectory: path.join(workspaceRoot, ".shell-home"),
    tmpDirectory: path.join(workspaceRoot, ".tmp"),
    toolBinDirectory: path.join(workspaceRoot, ".tool-bin"),
  };
};

const buildSanitizedShellEnvironment = (input: {
  bashRoot: string;
  shellHomeDirectory: string;
  tmpDirectory: string;
  toolBinDirectory: string;
}): Record<string, string> => {
  const pathEntries = [...new Set([input.toolBinDirectory, ...SAFE_SYSTEM_PATH_ENTRIES])];
  return {
    HOME: input.shellHomeDirectory,
    TMPDIR: input.tmpDirectory,
    PATH: pathEntries.join(path.delimiter),
    LANG: process.env.LANG?.trim() || "en_US.UTF-8",
    LC_ALL: process.env.LC_ALL?.trim() || process.env.LANG?.trim() || "en_US.UTF-8",
    PWD: input.bashRoot,
    SHELL: BASH_EXECUTABLE,
  };
};

class HostWorkspaceSandbox {
  private readonly bashRoot: string;
  private readonly readRoot: string;
  private readonly writeRoot: string;
  private readonly shellHomeDirectory: string;
  private readonly tmpDirectory: string;
  private readonly toolBinDirectory: string;
  private readonly env: Record<string, string>;
  private readonly actor: "agent" | "user" | "system";
  private readonly commandTimeoutMs: number;
  private readonly allowMutatingCommands: boolean;

  constructor(options: WorkspaceBashOptions) {
    this.bashRoot = path.resolve(options.workspaceRootDirectory);
    this.readRoot = path.resolve(options.readRootDirectory ?? options.workspaceRootDirectory);
    this.writeRoot = path.resolve(options.writeRootDirectory ?? options.workspaceRootDirectory);
    const sandboxDirectories = resolveWorkspaceSandboxDirectories(options);
    this.shellHomeDirectory = sandboxDirectories.shellHomeDirectory;
    this.tmpDirectory = sandboxDirectories.tmpDirectory;
    this.toolBinDirectory = sandboxDirectories.toolBinDirectory;
    this.env = buildSanitizedShellEnvironment({
      bashRoot: this.bashRoot,
      shellHomeDirectory: this.shellHomeDirectory,
      tmpDirectory: this.tmpDirectory,
      toolBinDirectory: this.toolBinDirectory,
    });
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

    await Promise.all([
      mkdir(this.bashRoot, { recursive: true }),
      mkdir(this.shellHomeDirectory, { recursive: true }),
      mkdir(this.tmpDirectory, { recursive: true }),
      mkdir(this.toolBinDirectory, { recursive: true }),
    ]);
    const child = Bun.spawn([BASH_EXECUTABLE, "--noprofile", "--norc", "-lc", sanitizedCommand], {
      cwd: this.bashRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: this.env,
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

  async listDirectory(input: {
    directoryPath: string;
    depth: number;
    limit: number;
    includeHidden: boolean;
  }): Promise<WorkspaceDirectoryListResult> {
    const absoluteDirectoryPath = assertWithinRoot(this.readRoot, input.directoryPath);
    assertDirectFilePathAllowed(absoluteDirectoryPath);
    await assertModelFilesystemReadAllowed({
      actor: this.actor,
      targetPath: absoluteDirectoryPath,
      reason: "list workspace directory",
    });

    const entries: WorkspaceDirectoryListResult["entries"] = [];
    let truncated = false;
    const visitDirectory = async (currentDirectory: string, remainingDepth: number): Promise<void> => {
      const directoryEntries = (await readdir(currentDirectory, { withFileTypes: true }))
        .filter((entry) => input.includeHidden || !entry.name.startsWith("."))
        .toSorted(compareDirectoryEntries);

      for (const entry of directoryEntries) {
        if (entries.length >= input.limit) {
          truncated = true;
          return;
        }

        const absoluteEntryPath = path.join(currentDirectory, entry.name);
        if (!isDirectFilePathAllowed(absoluteEntryPath)) {
          continue;
        }
        try {
          // Keep traversal order stable so `limit` and `truncated` match the returned entry order.
          // eslint-disable-next-line no-await-in-loop
          await assertModelFilesystemReadAllowed({
            actor: this.actor,
            targetPath: absoluteEntryPath,
            reason: "list workspace directory entry",
          });
        } catch (error) {
          if (error instanceof FilesystemPermissionDeniedError) {
            continue;
          }
          throw error;
        }

        entries.push({
          path: toWorkspaceRelativePath(this.readRoot, absoluteEntryPath),
          type: toDirectoryEntryType(entry),
        });

        if (entry.isDirectory() && remainingDepth > 0) {
          // eslint-disable-next-line no-await-in-loop
          await visitDirectory(absoluteEntryPath, remainingDepth - 1);
          if (truncated) {
            return;
          }
        }
      }
    };

    await visitDirectory(absoluteDirectoryPath, input.depth);

    return {
      directory: toWorkspaceRelativePath(this.readRoot, absoluteDirectoryPath),
      entries,
      truncated,
    };
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

export const WORKSPACE_BASH_TOOL_NAME = "workspaceBash";
export const WORKSPACE_LIST_DIRECTORY_TOOL_NAME = "workspaceListDirectory";
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
  const sandbox = new HostWorkspaceSandbox({
    ...options,
    workspaceRootDirectory: bashRootDirectory,
    writeRootDirectory,
  });

  const toolkit = await createBashTool({
    sandbox,
    destination: bashRootDirectory,
    extraInstructions: [
      `Only run commands from ${bashRootDirectory}.`,
      "Do not use parent traversal or absolute paths.",
      "Use workspaceListDirectory to browse files and folders inside the runtime workspace.",
      "Use workspaceBash only for shell commands and CLI investigation inside the runtime workspace.",
      "Use workspaceReadFile only for exact runtime workspace file reads.",
      "Use workspaceWriteFile for exact runtime workspace edits.",
    ].join(" "),
    onBeforeBashCall: ({ command }) => ({
      command: sanitizeCommand(command),
    }),
  });

  const rawBashTool = toolkit.tools.bash as { inputSchema: unknown; execute: (payload: unknown) => Promise<unknown> };
  const writableSession = (options.allowMutatingCommands ?? DEFAULT_ALLOW_MUTATING_COMMANDS) ? "writable" : "read-only";

  return {
    [WORKSPACE_LIST_DIRECTORY_TOOL_NAME]: tool({
      description:
        `List files and folders from the runtime workspace rooted at ${path.resolve(options.readRootDirectory ?? options.workspaceRootDirectory)}. ` +
        "Prefer this first for browsing the available runtime workspace paths before calling workspaceReadFile. " +
        "Returns exact workspace-relative paths that can be passed directly into workspaceReadFile. " +
        `Protected vault and keypair paths are omitted. ${MACHINE_TOOL_ENVELOPE_NOTE}`,
      inputSchema: getModelToolEnvelopeSchema(
        WORKSPACE_LIST_DIRECTORY_TOOL_NAME,
        listWorkspaceDirectoryInputSchema,
      ) as never,
      execute: async ({ params }) =>
        sandbox.listDirectory({
          directoryPath: (params as z.output<typeof listWorkspaceDirectoryInputSchema>).path,
          depth: (params as z.output<typeof listWorkspaceDirectoryInputSchema>).depth,
          limit: (params as z.output<typeof listWorkspaceDirectoryInputSchema>).limit,
          includeHidden: (params as z.output<typeof listWorkspaceDirectoryInputSchema>).includeHidden,
        }),
    }),
    [WORKSPACE_BASH_TOOL_NAME]: tool({
      description:
        `Run policy-constrained shell commands from the runtime workspace root ${bashRootDirectory}. This session is ${writableSession}. ` +
        `Always call this with an explicit command ` +
        "`type` inside `params`, such as `shell`, `cli`, `version`, `help`, `which`, `search_text`, `list_directory`, or `http_get`. " +
        `This is not a true isolated VM sandbox. ${MACHINE_TOOL_ENVELOPE_NOTE}`,
      inputSchema: getModelToolEnvelopeSchema(WORKSPACE_BASH_TOOL_NAME, workspaceBashInputSchema) as never,
      execute: async ({ params }) => {
        const input = workspaceBashInputSchema.parse(params);
        const command = resolveWorkspaceBashCommand(input);
        return rawBashTool.execute({ command });
      },
    }),
    [WORKSPACE_READ_FILE_TOOL_NAME]: tool({
      description:
        `Read an exact file from the runtime workspace rooted at ${path.resolve(options.readRootDirectory ?? options.workspaceRootDirectory)}. ` +
        "Prefer this when you already know the runtime workspace file path and need notes, configs, generated artifacts, or other runtime workspace contents. " +
        `Protected vault and keypair files are blocked from direct reads. ${MACHINE_TOOL_ENVELOPE_NOTE}`,
      inputSchema: getModelToolEnvelopeSchema(WORKSPACE_READ_FILE_TOOL_NAME, workspaceReadFileInputSchema) as never,
      execute: async ({ params }) =>
        ({ content: await sandbox.readFile((params as z.output<typeof workspaceReadFileInputSchema>).path) }),
    }),
    [WORKSPACE_WRITE_FILE_TOOL_NAME]: tool({
      description:
        `Create or replace a file inside the runtime workspace root ${writeRootDirectory}. ` +
        `Prefer this over mutating shell commands for notes, scratch files, output, and other runtime workspace artifacts. ${MACHINE_TOOL_ENVELOPE_NOTE}`,
      inputSchema: getModelToolEnvelopeSchema(WORKSPACE_WRITE_FILE_TOOL_NAME, workspaceWriteFileInputSchema) as never,
      execute: async ({ params }) => {
        const parsed = params as z.output<typeof workspaceWriteFileInputSchema>;
        await sandbox.writeFiles([{ path: parsed.path, content: parsed.content }]);
        return { ok: true, path: parsed.path };
      },
    }),
  };
};

export const resolveDefaultWorkspaceBashRoot = (): string => resolveActiveInstanceWorkspaceRootOrThrow();
