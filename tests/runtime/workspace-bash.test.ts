import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import {
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_LAYOUT_DIRECTORIES,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
  createWorkspaceBashTools,
} from "../../apps/trenchclaw/src/tools/workspace/bash";
import { runtimeStatePath } from "../helpers/core-paths";

const TEST_ROOT = runtimeStatePath("instances/01/workspace/.tests");
const createdPaths: string[] = [];

afterEach(async () => {
  for (const target of createdPaths.splice(0)) {
    await rm(target, { recursive: true, force: true });
  }
});

describe("workspace bash tools", () => {
  test("writes and reads persistent workspace files", async () => {
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
        path: "strategies/scalp.ts",
        content: "export const strategy = 'scalp';\n",
      },
    });

    const readResult = (await readTool.execute({ params: { path: "strategies/scalp.ts" } })) as { content: string };
    expect(readResult.content).toContain("strategy = 'scalp'");
  });

  test("executes bash commands from workspace root and blocks destructive commands", async () => {
    const workspaceRoot = path.join(TEST_ROOT, crypto.randomUUID());
    createdPaths.push(workspaceRoot);
    const tools = await createWorkspaceBashTools({
      workspaceRootDirectory: workspaceRoot,
      actor: "agent",
    });
    const bashTool = tools[WORKSPACE_BASH_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };

    const pwd = (await bashTool.execute({ params: { type: "shell", command: "pwd" } })) as {
      exitCode: number;
      stdout: string;
    };
    expect(pwd.exitCode).toBe(0);
    expect(pwd.stdout.trim()).toBe(workspaceRoot);

    const typedList = (await bashTool.execute({
      params: {
        type: "list_directory",
        path: ".",
        includeHidden: false,
      },
    })) as { exitCode: number; stdout: string };
    expect(typedList.exitCode).toBe(0);

    const envDetails = (await bashTool.execute({
      params: {
        type: "shell",
        command: "printf '%s\\n%s\\n%s\\n' \"$HOME\" \"$TMPDIR\" \"$PATH\"",
      },
    })) as { exitCode: number; stdout: string };
    const [homePath, tmpPath, pathValue] = envDetails.stdout.trim().split("\n");
    expect(envDetails.exitCode).toBe(0);
    expect(homePath).toBe(runtimeStatePath("instances/01/shell-home"));
    expect(tmpPath).toBe(runtimeStatePath("instances/01/tmp"));
    const resolvedPathValue = pathValue ?? "";
    expect(resolvedPathValue.length).toBeGreaterThan(0);
    expect(resolvedPathValue.split(path.delimiter)[0]).toBe(runtimeStatePath("instances/01/tool-bin"));

    const typedWhich = (await bashTool.execute({
      params: {
        type: "which",
        program: "bash",
      },
    })) as { exitCode: number; stdout: string };
    expect(typedWhich.exitCode).toBe(0);
    expect(typedWhich.stdout.trim().length).toBeGreaterThan(0);

    await expect(bashTool.execute({ params: { type: "shell", command: "sudo ls" } })).rejects.toThrow();
  });

  test("creates default workspace layout and blocks mutating bash commands by default", async () => {
    const workspaceRoot = path.join(TEST_ROOT, crypto.randomUUID());
    createdPaths.push(workspaceRoot);
    const tools = await createWorkspaceBashTools({
      workspaceRootDirectory: workspaceRoot,
      actor: "agent",
    });
    const bashTool = tools[WORKSPACE_BASH_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };
    const readTool = tools[WORKSPACE_READ_FILE_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };

    for (const directory of WORKSPACE_LAYOUT_DIRECTORIES) {
      const listing = (await bashTool.execute({ params: { type: "shell", command: `test -d ${directory} && echo ok` } })) as {
        exitCode: number;
        stdout: string;
      };
      expect(listing.exitCode).toBe(0);
      expect(listing.stdout.trim()).toBe("ok");
    }

    await expect(bashTool.execute({ params: { type: "shell", command: "echo hello > notes/from-bash.txt" } })).rejects.toThrow(
      "Mutating shell commands are disabled",
    );

    await expect(readTool.execute({ params: { path: "notes/from-bash.txt" } })).rejects.toThrow();
  });

  test("bridges supported host CLIs into the instance tool-bin", async () => {
    const workspaceRoot = path.join(TEST_ROOT, crypto.randomUUID());
    const fakeHostBin = path.join(runtimeStatePath(".tmp"), crypto.randomUUID());
    const fakeDunePath = path.join(fakeHostBin, "dune");
    createdPaths.push(workspaceRoot, fakeHostBin);

    await Bun.$`mkdir -p ${fakeHostBin}`.quiet();
    await Bun.write(fakeDunePath, "#!/usr/bin/env sh\nprintf 'dune 0.0.0-test\\n'\n");
    await Bun.$`chmod 755 ${fakeDunePath}`.quiet();

    const previousPath = process.env.PATH ?? "";
    process.env.PATH = `${fakeHostBin}${path.delimiter}${previousPath}`;

    try {
      const tools = await createWorkspaceBashTools({
        workspaceRootDirectory: workspaceRoot,
        actor: "agent",
      });
      const bashTool = tools[WORKSPACE_BASH_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };

      const typedWhich = (await bashTool.execute({
        params: {
          type: "which",
          program: "dune",
        },
      })) as { exitCode: number; stdout: string };
      expect(typedWhich.exitCode).toBe(0);
      expect(typedWhich.stdout.trim()).toBe(runtimeStatePath("instances/01/tool-bin/dune"));

      const versionResult = (await bashTool.execute({
        params: {
          type: "version",
          program: "dune",
        },
      })) as { exitCode: number; stdout: string };
      expect(versionResult.exitCode).toBe(0);
      expect(versionResult.stdout.trim()).toBe("dune 0.0.0-test");
    } finally {
      process.env.PATH = previousPath;
    }
  });

  test("blocks workspace file reads outside the runtime workspace root", async () => {
    const workspaceRoot = path.join(TEST_ROOT, crypto.randomUUID());
    createdPaths.push(workspaceRoot);
    const tools = await createWorkspaceBashTools({
      workspaceRootDirectory: workspaceRoot,
      actor: "agent",
    });
    const readTool = tools[WORKSPACE_READ_FILE_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };

    await expect(readTool.execute({ params: { path: "../outside.txt" } })).rejects.toThrow(
      "resolves outside allowed root",
    );
  });

  test("requires an explicit workspace bash type", async () => {
    const workspaceRoot = path.join(TEST_ROOT, crypto.randomUUID());
    createdPaths.push(workspaceRoot);
    const tools = await createWorkspaceBashTools({
      workspaceRootDirectory: workspaceRoot,
      actor: "agent",
    });
    const bashTool = tools[WORKSPACE_BASH_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };

    await expect(bashTool.execute({ command: "pwd" })).rejects.toThrow();
  });
});
