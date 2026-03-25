import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, symlink, unlink } from "node:fs/promises";
import path from "node:path";

import { RUNTIME_INSTANCE_ROOT } from "../../apps/trenchclaw/src/runtime/runtimePaths";
import { resolveInstanceToolBinRoot } from "../../apps/trenchclaw/src/runtime/instance/paths";
import {
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_LIST_DIRECTORY_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
  createWorkspaceBashTools,
} from "../../apps/trenchclaw/src/tools/workspace/bash";
import { runtimeStatePath } from "../helpers/core-paths";

const TEST_ROOT = runtimeStatePath("instances/01/workspace/.tests");
const INSTANCE_ID = "01";
const createdPaths: string[] = [];

const ensureToolBinSymlink = async (name: string, target: string): Promise<void> => {
  const toolBin = resolveInstanceToolBinRoot(INSTANCE_ID);
  await mkdir(toolBin, { recursive: true });
  const linkPath = path.join(toolBin, name);
  try {
    await unlink(linkPath);
  } catch {
    // ignore
  }
  await symlink(target, linkPath);
};

beforeEach(async () => {
  process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = INSTANCE_ID;
  const solana = Bun.which("solana");
  const helius = Bun.which("helius");
  if (solana) {
    await ensureToolBinSymlink("solana", solana);
  }
  if (helius) {
    await ensureToolBinSymlink("helius", helius);
  }
});

afterEach(async () => {
  for (const target of createdPaths.splice(0)) {
    await rm(target, { recursive: true, force: true });
  }
});

describe("workspace tools + Solana/Helius CLIs", () => {
  test("workspaceListDirectory lists workspace root", async () => {
    const workspaceRoot = path.join(TEST_ROOT, crypto.randomUUID());
    createdPaths.push(workspaceRoot);
    const tools = await createWorkspaceBashTools({
      workspaceRootDirectory: workspaceRoot,
      actor: "user",
    });
    const listTool = tools[WORKSPACE_LIST_DIRECTORY_TOOL_NAME] as {
      execute: (input: unknown) => Promise<{ directory: string; entries: unknown[]; truncated: boolean }>;
    };
    const result = await listTool.execute({ params: { path: ".", depth: 1, limit: 50, includeHidden: false } });
    expect(result.truncated).toBe(false);
    expect(result.directory).toBe(".");
    expect(Array.isArray(result.entries)).toBe(true);
  });

  test("workspaceWriteFile and workspaceReadFile roundtrip", async () => {
    const workspaceRoot = path.join(TEST_ROOT, crypto.randomUUID());
    createdPaths.push(workspaceRoot);
    const tools = await createWorkspaceBashTools({
      workspaceRootDirectory: workspaceRoot,
      actor: "user",
    });
    const writeTool = tools[WORKSPACE_WRITE_FILE_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };
    const readTool = tools[WORKSPACE_READ_FILE_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };
    await writeTool.execute({
      params: {
        path: "notes/cli-smoke.md",
        content: "# ok\n",
      },
    });
    const readResult = (await readTool.execute({ params: { path: "notes/cli-smoke.md" } })) as { content: string };
    expect(readResult.content).toContain("# ok");
  });

  test("workspaceBash: solana --version", async () => {
    if (!Bun.which("solana")) {
      return;
    }
    const workspaceRoot = path.join(RUNTIME_INSTANCE_ROOT, INSTANCE_ID, "workspace", ".cli-suite", crypto.randomUUID());
    createdPaths.push(workspaceRoot);
    await mkdir(workspaceRoot, { recursive: true });
    const tools = await createWorkspaceBashTools({
      workspaceRootDirectory: workspaceRoot,
      actor: "user",
      commandTimeoutMs: 60_000,
    });
    const bashTool = tools[WORKSPACE_BASH_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };
    const out = (await bashTool.execute({ params: { type: "version", program: "solana" } })) as {
      exitCode: number;
      stdout: string;
    };
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toMatch(/solana-cli|solana\s/i);
  });

  test("workspaceBash: helius --version", async () => {
    if (!Bun.which("helius")) {
      return;
    }
    const workspaceRoot = path.join(RUNTIME_INSTANCE_ROOT, INSTANCE_ID, "workspace", ".cli-suite", crypto.randomUUID());
    createdPaths.push(workspaceRoot);
    await mkdir(workspaceRoot, { recursive: true });
    const tools = await createWorkspaceBashTools({
      workspaceRootDirectory: workspaceRoot,
      actor: "user",
      commandTimeoutMs: 60_000,
    });
    const bashTool = tools[WORKSPACE_BASH_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };
    const out = (await bashTool.execute({ params: { type: "version", program: "helius" } })) as {
      exitCode: number;
      stdout: string;
      stderr: string;
    };
    expect(out.exitCode).toBe(0);
    expect(`${out.stdout}${out.stderr}`).toMatch(/\d+\.\d+\.\d+/);
  });

  test("workspaceBash: combined solana and helius", async () => {
    if (!Bun.which("solana") || !Bun.which("helius")) {
      return;
    }
    const workspaceRoot = path.join(RUNTIME_INSTANCE_ROOT, INSTANCE_ID, "workspace", ".cli-suite", crypto.randomUUID());
    createdPaths.push(workspaceRoot);
    await mkdir(workspaceRoot, { recursive: true });
    const tools = await createWorkspaceBashTools({
      workspaceRootDirectory: workspaceRoot,
      actor: "user",
      commandTimeoutMs: 60_000,
    });
    const bashTool = tools[WORKSPACE_BASH_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };
    const out = (await bashTool.execute({ params: { type: "shell", command: "solana --version && helius --version" } })) as {
      exitCode: number;
      stdout: string;
    };
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toMatch(/solana-cli|solana\s/i);
  });

  test("workspaceBash: helius --help exits successfully", async () => {
    if (!Bun.which("helius")) {
      return;
    }
    const workspaceRoot = path.join(RUNTIME_INSTANCE_ROOT, INSTANCE_ID, "workspace", ".cli-suite", crypto.randomUUID());
    createdPaths.push(workspaceRoot);
    await mkdir(workspaceRoot, { recursive: true });
    const tools = await createWorkspaceBashTools({
      workspaceRootDirectory: workspaceRoot,
      actor: "user",
      commandTimeoutMs: 60_000,
    });
    const bashTool = tools[WORKSPACE_BASH_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };
    const out = (await bashTool.execute({ params: { type: "help", program: "helius" } })) as {
      exitCode: number;
      stdout: string;
      stderr: string;
    };
    expect(out.exitCode).toBe(0);
    expect(`${out.stdout}${out.stderr}`.length).toBeGreaterThan(10);
  });

  test("workspaceBash: command -v finds symlinks in tool-bin", async () => {
    if (!Bun.which("solana") || !Bun.which("helius")) {
      return;
    }
    const workspaceRoot = path.join(RUNTIME_INSTANCE_ROOT, INSTANCE_ID, "workspace", ".cli-suite", crypto.randomUUID());
    createdPaths.push(workspaceRoot);
    await mkdir(workspaceRoot, { recursive: true });
    const tools = await createWorkspaceBashTools({
      workspaceRootDirectory: workspaceRoot,
      actor: "agent",
      commandTimeoutMs: 60_000,
    });
    const bashTool = tools[WORKSPACE_BASH_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };
    const out = (await bashTool.execute({ params: { type: "which", program: "solana" } })) as {
      exitCode: number;
      stdout: string;
    };
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain("solana");
  });
});

describe("workspaceBash writes CLI output to a file (read back)", () => {
  test("uses workspaceWriteFile for output instead of shell redirect when mutations disabled", async () => {
    if (!Bun.which("solana")) {
      return;
    }
    const workspaceRoot = path.join(RUNTIME_INSTANCE_ROOT, INSTANCE_ID, "workspace", ".cli-suite", crypto.randomUUID());
    createdPaths.push(workspaceRoot);
    await mkdir(workspaceRoot, { recursive: true });
    const tools = await createWorkspaceBashTools({
      workspaceRootDirectory: workspaceRoot,
      actor: "user",
      commandTimeoutMs: 60_000,
    });
    const bashTool = tools[WORKSPACE_BASH_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };
    const writeTool = tools[WORKSPACE_WRITE_FILE_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };
    const readTool = tools[WORKSPACE_READ_FILE_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };

    const run = (await bashTool.execute({ params: { type: "version", program: "solana" } })) as {
      stdout: string;
      exitCode: number;
    };
    expect(run.exitCode).toBe(0);

    await writeTool.execute({
      params: {
        path: "output/solana-version.txt",
        content: run.stdout,
      },
    });

    const disk = await readFile(path.join(workspaceRoot, "output/solana-version.txt"), "utf8");
    expect(disk).toMatch(/solana-cli|solana\s/i);

    const viaTool = (await readTool.execute({ params: { path: "output/solana-version.txt" } })) as { content: string };
    expect(viaTool.content).toBe(disk);
  });
});
