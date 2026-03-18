import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = "/Volumes/T9/cursor/TrenchClaw";
const RUNTIME_PATHS_MODULE = "/Volumes/T9/cursor/TrenchClaw/apps/trenchclaw/src/runtime/runtime-paths.ts";
const AI_SETTINGS_MODULE = "/Volumes/T9/cursor/TrenchClaw/apps/trenchclaw/src/ai/llm/ai-settings-file.ts";
const USER_SETTINGS_MODULE = "/Volumes/T9/cursor/TrenchClaw/apps/trenchclaw/src/ai/llm/user-settings-loader.ts";
const SCHEDULER_MODULE = "/Volumes/T9/cursor/TrenchClaw/apps/trenchclaw/src/ai/core/scheduler.ts";

const createdDirectories = new Set<string>();
const BUN_BINARY = Bun.which("bun") ?? process.execPath;

const makeTempDirectory = async (): Promise<string> => {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), "trenchclaw-runtime-contract-"));
  createdDirectories.add(directoryPath);
  return directoryPath;
};

const runModuleEval = async (
  script: string,
  env: Record<string, string | undefined>,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> => {
  const proc = Bun.spawn([BUN_BINARY, "--eval", script], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
};

afterEach(async () => {
  for (const directoryPath of createdDirectories) {
    await rm(directoryPath, { recursive: true, force: true });
  }
  createdDirectories.clear();
});

describe("runtime path contract", () => {
  test("rejects a relative runtime state root override", async () => {
    const result = await runModuleEval(
      `await import(${JSON.stringify(RUNTIME_PATHS_MODULE)});`,
      {
        TRENCHCLAW_RUNTIME_STATE_ROOT: ".runtime-state",
      },
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("TRENCHCLAW_RUNTIME_STATE_ROOT must be an absolute path");
  });

  test("rejects a relative app root override", async () => {
    const result = await runModuleEval(
      `await import(${JSON.stringify(RUNTIME_PATHS_MODULE)});`,
      {
        TRENCHCLAW_APP_ROOT: "apps/trenchclaw",
      },
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("TRENCHCLAW_APP_ROOT must be an absolute path");
  });

  test("resolves ai settings under the configured runtime root", async () => {
    const runtimeRoot = await makeTempDirectory();
    const result = await runModuleEval(
      `
        const mod = await import(${JSON.stringify(AI_SETTINGS_MODULE)});
        const payload = await mod.resolveAiSettingsPaths();
        console.log(JSON.stringify(payload));
      `,
      {
        TRENCHCLAW_RUNTIME_STATE_ROOT: runtimeRoot,
      },
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout) as { filePath: string };
    expect(payload.filePath).toBe(path.join(runtimeRoot, "runtime", "ai.json"));
  });

  test("resolves compatibility settings under the configured runtime root", async () => {
    const runtimeRoot = await makeTempDirectory();
    const result = await runModuleEval(
      `
        const mod = await import(${JSON.stringify(USER_SETTINGS_MODULE)});
        const payload = await mod.loadResolvedUserSettings();
        console.log(JSON.stringify({ compatibilitySettingsPath: payload.compatibilitySettingsPath }));
      `,
      {
        TRENCHCLAW_RUNTIME_STATE_ROOT: runtimeRoot,
      },
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout) as { compatibilitySettingsPath: string };
    expect(payload.compatibilitySettingsPath).toBe(path.join(runtimeRoot, "runtime", "settings.json"));
  });

  test("resolves relative queue paths under the configured runtime root", async () => {
    const runtimeRoot = await makeTempDirectory();
    const result = await runModuleEval(
      `
        const mod = await import(${JSON.stringify(SCHEDULER_MODULE)});
        console.log(mod.resolveQueueDataPath("db/queue/custom.sqlite"));
      `,
      {
        TRENCHCLAW_RUNTIME_STATE_ROOT: runtimeRoot,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(path.join(runtimeRoot, "db", "queue", "custom.sqlite"));
  });
});
