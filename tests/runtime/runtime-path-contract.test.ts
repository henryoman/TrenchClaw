import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { initializeDeveloperRuntime } from "../../scripts/lib/dev-runtime";

const WORKSPACE_ROOT = path.resolve(import.meta.dir, "../..");
const CORE_APP_ROOT = path.join(WORKSPACE_ROOT, "apps/trenchclaw");
const RUNTIME_PATHS_MODULE = pathToFileURL(
  path.join(CORE_APP_ROOT, "src/runtime/runtimePaths.ts"),
).href;
const AI_SETTINGS_MODULE = pathToFileURL(
  path.join(CORE_APP_ROOT, "src/ai/llm/aiSettingsFile.ts"),
).href;
const USER_SETTINGS_MODULE = pathToFileURL(
  path.join(CORE_APP_ROOT, "src/ai/llm/userSettingsLoader.ts"),
).href;
const SCHEDULER_MODULE = pathToFileURL(
  path.join(CORE_APP_ROOT, "src/ai/core/scheduler.ts"),
).href;
const RUNTIME_SEED_ROOT = path.join(CORE_APP_ROOT, ".runtime");

const createdDirectories = new Set<string>();
const SHELL_COMMAND = process.platform === "win32"
  ? ["cmd.exe", "/d", "/s", "/c", "bun --eval \"%TRENCHCLAW_TEST_SCRIPT%\""]
  : ["/bin/bash", "-lc", "bun --eval \"$TRENCHCLAW_TEST_SCRIPT\""];

const makeTempDirectory = async (): Promise<string> => {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), "trenchclaw-runtime-contract-"));
  createdDirectories.add(directoryPath);
  return directoryPath;
};

const createPersistedInstance = async (runtimeRoot: string, localInstanceId: string): Promise<void> => {
  const instanceRoot = path.join(runtimeRoot, "instances", localInstanceId);
  await mkdir(instanceRoot, { recursive: true });
  await writeFile(
    path.join(instanceRoot, "instance.json"),
    `${JSON.stringify({
      instance: {
        name: `instance-${localInstanceId}`,
        localInstanceId,
        userPin: null,
      },
      runtime: {
        safetyProfile: "dangerous",
        createdAt: "2026-03-11T00:00:00.000Z",
        updatedAt: "2026-03-11T00:00:00.000Z",
      },
    }, null, 2)}\n`,
    "utf8",
  );
};

const runModuleEval = async (
  script: string,
  env: Record<string, string | undefined>,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> => {
  const proc = Bun.spawn({
    cmd: SHELL_COMMAND,
    cwd: WORKSPACE_ROOT,
    env: {
      ...process.env,
      ...env,
      TRENCHCLAW_TEST_SCRIPT: script,
    },
    stdout: "pipe",
    stderr: "pipe",
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
  test("defaults workspace runtime state to the external developer runtime root", async () => {
    const homeRoot = await makeTempDirectory();
    const result = await runModuleEval(
      `
        const mod = await import(${JSON.stringify(RUNTIME_PATHS_MODULE)});
        console.log(mod.RUNTIME_STATE_ROOT);
      `,
      {
        HOME: homeRoot,
        USERPROFILE: homeRoot,
        TRENCHCLAW_RUNTIME_STATE_ROOT: "",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(path.join(homeRoot, ".trenchclaw-dev-runtime"));
    expect(result.stdout.trim()).not.toBe(path.join(CORE_APP_ROOT, ".runtime-state"));
  });

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
    await createPersistedInstance(runtimeRoot, "01");
    const result = await runModuleEval(
      `
        const mod = await import(${JSON.stringify(AI_SETTINGS_MODULE)});
        const payload = await mod.resolveAiSettingsPaths();
        console.log(JSON.stringify(payload));
      `,
      {
        TRENCHCLAW_ACTIVE_INSTANCE_ID: "01",
        TRENCHCLAW_RUNTIME_STATE_ROOT: runtimeRoot,
      },
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout) as { filePath: string };
    expect(payload.filePath).toBe(path.join(runtimeRoot, "instances", "01", "settings", "ai.json"));
  });

  test("resolves compatibility settings under the configured runtime root", async () => {
    const runtimeRoot = await makeTempDirectory();
    await createPersistedInstance(runtimeRoot, "01");
    const result = await runModuleEval(
      `
        const mod = await import(${JSON.stringify(USER_SETTINGS_MODULE)});
        const payload = await mod.loadResolvedUserSettings();
        console.log(JSON.stringify({ compatibilitySettingsPath: payload.compatibilitySettingsPath }));
      `,
      {
        TRENCHCLAW_ACTIVE_INSTANCE_ID: "01",
        TRENCHCLAW_RUNTIME_STATE_ROOT: runtimeRoot,
      },
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout) as { compatibilitySettingsPath: string };
    expect(payload.compatibilitySettingsPath).toBe(path.join(runtimeRoot, "instances", "01", "settings", "settings.json"));
  });

  test("resolves relative queue paths under the configured runtime root", async () => {
    const runtimeRoot = await makeTempDirectory();
    await createPersistedInstance(runtimeRoot, "01");
    const result = await runModuleEval(
      `
        const mod = await import(${JSON.stringify(SCHEDULER_MODULE)});
        console.log(mod.resolveQueueDataPath("instances/01/cache/custom.sqlite"));
      `,
      {
        TRENCHCLAW_ACTIVE_INSTANCE_ID: "01",
        TRENCHCLAW_RUNTIME_STATE_ROOT: runtimeRoot,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(path.join(runtimeRoot, "instances", "01", "cache", "custom.sqlite"));
  });

  test("ships a tracked runtime seed contract", async () => {
    const seedRequiredPaths = [
      path.join(RUNTIME_SEED_ROOT, "README.md"),
      path.join(RUNTIME_SEED_ROOT, "instances", "00", "instance.json"),
      path.join(RUNTIME_SEED_ROOT, "instances", "00", "settings", "ai.json"),
      path.join(RUNTIME_SEED_ROOT, "instances", "00", "settings", "settings.json"),
      path.join(RUNTIME_SEED_ROOT, "instances", "00", "settings", "trading.json"),
    ];

    for (const targetPath of seedRequiredPaths) {
      await expect(stat(targetPath)).resolves.toBeDefined();
    }

    const runtimeRoot = await makeTempDirectory();
    const generatedRoot = path.join(runtimeRoot, "instances", "01", "cache", "generated");
    await initializeDeveloperRuntime({
      runtimeRoot,
      generatedRoot,
      instanceId: "01",
    });

    const initializedRuntimePaths = [
      path.join(runtimeRoot, "instances", "active-instance.json"),
      path.join(runtimeRoot, "instances", "01", "instance.json"),
      path.join(runtimeRoot, "instances", "01", "settings", "ai.json"),
      path.join(runtimeRoot, "instances", "01", "settings", "settings.json"),
      path.join(runtimeRoot, "instances", "01", "settings", "trading.json"),
      path.join(runtimeRoot, "instances", "01", "settings", "wakeup.json"),
      path.join(runtimeRoot, "instances", "01", "secrets", "vault.json"),
      path.join(runtimeRoot, "instances", "01", "workspace", "configs"),
      path.join(runtimeRoot, "instances", "01", "workspace", "configs", "tracker.json"),
      path.join(runtimeRoot, "instances", "01", "workspace", "configs", "news-feeds.json"),
      path.join(runtimeRoot, "instances", "01", "workspace", "added-knowledge"),
    ];

    for (const targetPath of initializedRuntimePaths) {
      await expect(stat(targetPath)).resolves.toBeDefined();
    }
  });
});
