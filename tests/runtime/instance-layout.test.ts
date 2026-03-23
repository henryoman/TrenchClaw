import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WORKSPACE_ROOT = path.resolve(import.meta.dir, "../..");
const CORE_APP_ROOT = path.join(WORKSPACE_ROOT, "apps/trenchclaw");
const INSTANCE_LAYOUT_MODULE_URL = pathToFileURL(
  path.join(CORE_APP_ROOT, "src/runtime/instance-layout.ts"),
).href;
const INSTANCE_LAYOUT_SCHEMA_MODULE_URL = pathToFileURL(
  path.join(CORE_APP_ROOT, "src/runtime/instance-layout-schema.ts"),
).href;

const createdRuntimeRoots: string[] = [];

const createRuntimeRoot = async (): Promise<string> => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "trenchclaw-instance-layout-"));
  createdRuntimeRoots.push(runtimeRoot);
  await mkdir(path.join(runtimeRoot, "instances"), { recursive: true });
  return runtimeRoot;
};

const runScriptJson = async <T>(input: {
  script: string;
  runtimeRoot: string;
}): Promise<T> => {
  const processHandle = Bun.spawn({
    cmd: [process.execPath, "-e", input.script],
    cwd: WORKSPACE_ROOT,
    env: {
      ...process.env,
      TRENCHCLAW_APP_ROOT: CORE_APP_ROOT,
      TRENCHCLAW_RUNTIME_STATE_ROOT: input.runtimeRoot,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
    processHandle.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr || stdout || `Script exited with code ${exitCode}`);
  }

  return JSON.parse(stdout) as T;
};

afterEach(async () => {
  for (const runtimeRoot of createdRuntimeRoots.splice(0)) {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

describe("ensureInstanceLayout", () => {
  test("creates directories in contract order and is idempotent", async () => {
    const runtimeRoot = await createRuntimeRoot();

    const result = await runScriptJson<{
      first: { instanceRoot: string; createdDirectories: string[]; createdFiles: string[] };
      second: { createdDirectories: string[]; createdFiles: string[] };
      expectedDirectoryPaths: string[];
    }>({
      runtimeRoot,
      script: `
        const { ensureInstanceLayout } = await import(${JSON.stringify(INSTANCE_LAYOUT_MODULE_URL)});
        const { INSTANCE_LAYOUT_DIRECTORY_PATHS } = await import(${JSON.stringify(INSTANCE_LAYOUT_SCHEMA_MODULE_URL)});
        const first = await ensureInstanceLayout("01");
        const second = await ensureInstanceLayout("01");
        process.stdout.write(JSON.stringify({
          first,
          second,
          expectedDirectoryPaths: INSTANCE_LAYOUT_DIRECTORY_PATHS,
        }));
      `,
    });

    expect(
      result.first.createdDirectories.map((directoryPath) =>
        path.relative(result.first.instanceRoot, directoryPath).split(path.sep).join("/")),
    ).toEqual(result.expectedDirectoryPaths);
    expect(result.first.createdFiles.map((filePath) => path.basename(filePath)).toSorted()).toEqual([
      "ai.json",
      "news-feeds.json",
      "settings.json",
      "tracker.json",
      "trading.json",
      "vault.json",
    ]);
    expect(result.second.createdDirectories).toEqual([]);
    expect(result.second.createdFiles).toEqual([]);
  });
});
