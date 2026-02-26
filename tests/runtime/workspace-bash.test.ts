import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import {
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
  createWorkspaceBashTools,
} from "../../apps/trenchclaw/src/runtime/workspace-bash";

const TEST_ROOT = path.resolve(process.cwd(), "src/ai/brain/workspace/.tests");
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
      actor: "agent",
    });

    const writeTool = tools[WORKSPACE_WRITE_FILE_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };
    const readTool = tools[WORKSPACE_READ_FILE_TOOL_NAME] as { execute: (input: unknown) => Promise<unknown> };
    await writeTool.execute({
      path: "strategies/scalp.ts",
      content: "export const strategy = 'scalp';\n",
    });

    const readResult = (await readTool.execute({ path: "strategies/scalp.ts" })) as { content: string };
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

    const pwd = (await bashTool.execute({ command: "pwd" })) as { exitCode: number; stdout: string };
    expect(pwd.exitCode).toBe(0);
    expect(pwd.stdout.trim()).toBe(workspaceRoot);

    await expect(bashTool.execute({ command: "sudo ls" })).rejects.toThrow();
  });
});
