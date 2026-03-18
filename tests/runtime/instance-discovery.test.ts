import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
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
const BUN_BINARY = Bun.which("bun") ?? process.execPath;

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

const createPersistedInstance = async (
  runtimeRoot: string,
  input: { localInstanceId: string; name: string; userPin?: string | null },
): Promise<void> => {
  const instanceRoot = path.join(runtimeRoot, "instances", input.localInstanceId);
  await mkdir(instanceRoot, { recursive: true });
  await writeFile(
    path.join(instanceRoot, "instance.json"),
    `${JSON.stringify({
      instance: {
        name: input.name,
        localInstanceId: input.localInstanceId,
        userPin: input.userPin ?? null,
      },
      runtime: {
        safetyProfile: "dangerous",
        createdAt: "2026-03-11T00:00:00.000Z",
        updatedAt: "2026-03-11T00:00:00.000Z",
      },
    })}\n`,
    "utf8",
  );
};

const runScriptJson = async <T>(input: {
  script: string;
  runtimeRoot: string;
  env?: Record<string, string>;
}): Promise<T> => {
  const processHandle = Bun.spawn({
    cmd: [
      BUN_BINARY,
      "-e",
      input.script,
    ],
    cwd: WORKSPACE_ROOT,
    env: {
      ...process.env,
      TRENCHCLAW_APP_ROOT: CORE_APP_ROOT,
      TRENCHCLAW_RUNTIME_STATE_ROOT: input.runtimeRoot,
      ...input.env,
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
  test("ignores directory-only instance roots and creates the first persisted profile at 01", async () => {
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

    expect(result.listed.instances).toHaveLength(0);
    expect(result.created.instance.localInstanceId).toBe("01");
    expect(await Bun.file(path.join(runtimeRoot, "instances/01/settings/trading.json")).exists()).toBe(true);
    expect(await Bun.file(path.join(runtimeRoot, "instances/01/vault.json")).exists()).toBe(true);
    expect((await stat(path.join(runtimeRoot, "instances/01/keypairs"))).isDirectory()).toBe(true);
  });

  test("lists and signs into a persisted instance profile", async () => {
    const runtimeRoot = await createRuntimeRoot();
    await createPersistedInstance(runtimeRoot, { localInstanceId: "01", name: "test" });

    const result = await runScriptJson<{
      listed: { instances: Array<{ localInstanceId: string; name: string }> };
      signedIn: { instance: { localInstanceId: string; name: string } };
      activeInstanceId: string | null;
    }>({
      runtimeRoot,
      script: `
        const { listInstances, signInInstance } = await import(${JSON.stringify(INSTANCES_MODULE_URL)});
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
        const listed = await listInstances();
        const signedIn = await signInInstance(context, { localInstanceId: "01" });
        process.stdout.write(JSON.stringify({ listed, signedIn, activeInstanceId }));
      `,
    });

    expect(result.listed.instances).toHaveLength(1);
    expect(result.listed.instances[0]?.name).toBe("test");
    expect(result.signedIn.instance.localInstanceId).toBe("01");
    expect(result.signedIn.instance.name).toBe("test");
    expect(result.activeInstanceId).toBe("01");
    expect(await Bun.file(path.join(runtimeRoot, "instances/01/settings/trading.json")).exists()).toBe(true);
    expect(await Bun.file(path.join(runtimeRoot, "instances/01/vault.json")).exists()).toBe(true);
    expect((await stat(path.join(runtimeRoot, "instances/01/keypairs"))).isDirectory()).toBe(true);
  });

  test("reads vault-backed LLM config from the active instance vault without a shared fallback", async () => {
    const runtimeRoot = await createRuntimeRoot();
    await createPersistedInstance(runtimeRoot, { localInstanceId: "01", name: "test" });
    await writeFile(
      path.join(runtimeRoot, "instances/01/vault.json"),
      `${JSON.stringify({
        llm: {
          openrouter: {
            "api-key": "instance-openrouter-key",
          },
        },
      })}\n`,
      "utf8",
    );
    await mkdir(path.join(runtimeRoot, "runtime"), { recursive: true });
    await writeFile(
      path.join(runtimeRoot, "runtime/ai.json"),
      `${JSON.stringify({
        provider: "openrouter",
        model: "anthropic/claude-sonnet-4.6",
        defaultMode: "primary",
        temperature: null,
        maxOutputTokens: null,
      })}\n`,
      "utf8",
    );

    const result = await runScriptJson<{
      provider: string | null;
      apiKey: string | null;
    }>({
      runtimeRoot,
      env: {
        TRENCHCLAW_ACTIVE_INSTANCE_ID: "01",
      },
      script: `
        const { resolveLlmProviderConfigFromVault } = await import(${JSON.stringify(
          pathToFileURL(path.join(CORE_APP_ROOT, "src/ai/llm/config.ts")).href,
        )});
        const resolved = await resolveLlmProviderConfigFromVault();
        process.stdout.write(JSON.stringify({
          provider: resolved?.provider ?? null,
          apiKey: resolved?.apiKey ?? null,
        }));
      `,
    });

    expect(result.provider).toBe("openrouter");
    expect(result.apiKey).toBe("instance-openrouter-key");
  });

  test("does not sign into a directory-only instance", async () => {
    const runtimeRoot = await createRuntimeRoot();
    await createDirectoryOnlyInstance(runtimeRoot, "01");

    const result = await runScriptJson<{ message: string }>({
      runtimeRoot,
      script: `
        const { signInInstance } = await import(${JSON.stringify(INSTANCES_MODULE_URL)});
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
        try {
          await signInInstance(context, { localInstanceId: "01" });
          process.stdout.write(JSON.stringify({ message: "unexpected-success" }));
        } catch (error) {
          process.stdout.write(JSON.stringify({ message: error instanceof Error ? error.message : String(error) }));
        }
      `,
    });

    expect(result.message).toContain("Instance not found");
  });

  test("does not restore a persisted active instance when the profile file is missing", async () => {
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

    expect(restored).toBeNull();
  });

  test("auto-restores a single persisted instance profile", async () => {
    const runtimeRoot = await createRuntimeRoot();
    await createPersistedInstance(runtimeRoot, { localInstanceId: "01", name: "test" });

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
    expect(restored?.name).toBe("test");
    expect(restored?.userPinRequired).toBe(false);
  });
});
