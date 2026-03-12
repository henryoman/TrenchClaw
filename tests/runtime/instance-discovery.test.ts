import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WORKSPACE_ROOT = path.resolve(import.meta.dir, "../..");
const CORE_APP_ROOT = path.join(WORKSPACE_ROOT, "apps/trenchclaw");
const INSTANCES_MODULE_URL = pathToFileURL(
  path.join(CORE_APP_ROOT, "src/runtime/gui-transport/domains/instances.ts"),
).href;
const INSTANCE_STATE_MODULE_URL = pathToFileURL(
  path.join(CORE_APP_ROOT, "src/runtime/instance-state.ts"),
).href;

const createdRuntimeRoots: string[] = [];

const createRuntimeRoot = async (): Promise<string> => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "trenchclaw-instance-discovery-"));
  createdRuntimeRoots.push(runtimeRoot);
  await mkdir(path.join(runtimeRoot, "instances"), { recursive: true });
  return runtimeRoot;
};

const createDirectoryOnlyInstance = async (runtimeRoot: string, localInstanceId: string): Promise<void> => {
  const instanceRoot = path.join(runtimeRoot, "instances", localInstanceId);
  await mkdir(path.join(instanceRoot, "keypairs/test-wallets"), { recursive: true });
};

const runScriptJson = async <T>(input: {
  script: string;
  runtimeRoot: string;
}): Promise<T> => {
  const processHandle = Bun.spawn({
    cmd: [
      process.execPath,
      "-e",
      input.script,
    ],
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

describe("instance discovery", () => {
  test("lists directory-only instances and skips their ids when creating a new instance", async () => {
    const runtimeRoot = await createRuntimeRoot();
    await createDirectoryOnlyInstance(runtimeRoot, "01");

    const result = await runScriptJson<{
      listed: { instances: Array<{ localInstanceId: string; name: string }> };
      created: { instance: { localInstanceId: string } };
    }>({
      runtimeRoot,
      script: `
        const { listInstances, createInstance } = await import(${JSON.stringify(INSTANCES_MODULE_URL)});
        const context = {
          runtime: {},
          getActiveInstance: () => null,
          setActiveInstance: () => {},
          getActiveChatId: () => null,
          setActiveChatId: () => {},
          addActivity: () => {},
          listInstanceConversations: () => [],
          resolveDefaultChatId: () => "chat-test",
          getActivityEntries: () => [],
          waitForJobResult: async () => null,
        };
        const listed = await listInstances();
        const created = await createInstance(context, { name: "two" });
        process.stdout.write(JSON.stringify({ listed, created }));
      `,
    });

    expect(result.listed.instances).toHaveLength(1);
    expect(result.listed.instances[0]?.localInstanceId).toBe("01");
    expect(result.listed.instances[0]?.name).toBe("01");
    expect(result.created.instance.localInstanceId).toBe("02");
  });

  test("signs into a directory-only instance", async () => {
    const runtimeRoot = await createRuntimeRoot();
    await createDirectoryOnlyInstance(runtimeRoot, "01");

    const result = await runScriptJson<{
      signedIn: { instance: { localInstanceId: string; name: string } };
      activeInstanceId: string | null;
    }>({
      runtimeRoot,
      script: `
        const { signInInstance } = await import(${JSON.stringify(INSTANCES_MODULE_URL)});
        let activeInstanceId = null;
        const context = {
          runtime: {},
          getActiveInstance: () => null,
          setActiveInstance: (instance) => {
            activeInstanceId = instance?.localInstanceId ?? null;
          },
          getActiveChatId: () => null,
          setActiveChatId: () => {},
          addActivity: () => {},
          listInstanceConversations: () => [],
          resolveDefaultChatId: () => "chat-test",
          getActivityEntries: () => [],
          waitForJobResult: async () => null,
        };
        const signedIn = await signInInstance(context, { localInstanceId: "01" });
        process.stdout.write(JSON.stringify({ signedIn, activeInstanceId }));
      `,
    });

    expect(result.signedIn.instance.localInstanceId).toBe("01");
    expect(result.signedIn.instance.name).toBe("01");
    expect(result.activeInstanceId).toBe("01");
  });

  test("restores a persisted active instance when only the directory exists", async () => {
    const runtimeRoot = await createRuntimeRoot();
    await createDirectoryOnlyInstance(runtimeRoot, "01");
    await writeFile(
      path.join(runtimeRoot, "instances/active-instance.json"),
      `${JSON.stringify({
        fileName: "instance.json",
        localInstanceId: "01",
        name: "one",
        safetyProfile: "dangerous",
        userPinRequired: false,
        createdAt: "2026-03-11T00:00:00.000Z",
        updatedAt: "2026-03-11T00:00:00.000Z",
      })}\n`,
      "utf8",
    );

    const restored = await runScriptJson<{
      fileName: string;
      localInstanceId: string;
      name: string;
    } | null>({
      runtimeRoot,
      script: `
        const { readPersistedActiveInstanceSync } = await import(${JSON.stringify(INSTANCE_STATE_MODULE_URL)});
        process.stdout.write(JSON.stringify(readPersistedActiveInstanceSync()));
      `,
    });

    expect(restored).not.toBeNull();
    expect(restored?.localInstanceId).toBe("01");
    expect(restored?.name).toBe("one");
    expect(restored?.fileName).toBe("instance.json");
  });

  test("auto-restores a single directory-only instance without active-instance metadata", async () => {
    const runtimeRoot = await createRuntimeRoot();
    await createDirectoryOnlyInstance(runtimeRoot, "01");

    const restored = await runScriptJson<{
      fileName: string;
      localInstanceId: string;
      name: string;
      userPinRequired: boolean;
    } | null>({
      runtimeRoot,
      script: `
        const { readPersistedActiveInstanceSync } = await import(${JSON.stringify(INSTANCE_STATE_MODULE_URL)});
        process.stdout.write(JSON.stringify(readPersistedActiveInstanceSync()));
      `,
    });

    expect(restored).not.toBeNull();
    expect(restored?.localInstanceId).toBe("01");
    expect(restored?.name).toBe("01");
    expect(restored?.userPinRequired).toBe(false);
  });
});
