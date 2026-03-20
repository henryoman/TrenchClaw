import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  cloneDeveloperInstance,
  getDefaultDeveloperRuntimeRoots,
  initializeDeveloperRuntime,
  resolveDeveloperBootstrapRoots,
} from "../../scripts/lib/dev-runtime";

const createdRoots: string[] = [];

const createTempRoot = async (prefix: string): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  createdRoots.push(root);
  return root;
};

afterEach(async () => {
  for (const root of createdRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("developer runtime workflow", () => {
  test("initializes an external developer runtime root with active instance and managed gitignore", async () => {
    const runtimeRoot = await createTempRoot("trenchclaw-dev-runtime-");
    const generatedRoot = await createTempRoot("trenchclaw-dev-generated-");

    const result = await initializeDeveloperRuntime({
      runtimeRoot,
      generatedRoot,
      instanceId: "07",
      instanceName: "dev-seven",
    });

    expect(result.runtimeRoot).toBe(runtimeRoot);
    expect(result.generatedRoot).toBe(generatedRoot);
    expect(result.instanceId).toBe("07");
    expect(await Bun.file(path.join(runtimeRoot, "instances", "active-instance.json")).json()).toEqual({
      localInstanceId: "07",
    });
    const instanceJson = await Bun.file(path.join(runtimeRoot, "instances", "07", "instance.json")).json() as {
      instance: { name: string; localInstanceId: string };
    };
    expect(instanceJson.instance).toMatchObject({
      name: "dev-seven",
      localInstanceId: "07",
    });
    expect(await Bun.file(path.join(runtimeRoot, "instances", "07", "settings", "ai.json")).exists()).toBe(true);
    expect(await Bun.file(path.join(runtimeRoot, "instances", "07", "secrets", "vault.json")).exists()).toBe(true);
    expect(await Bun.file(path.join(runtimeRoot, ".gitignore")).text()).toContain("/instances/*/secrets/vault.json");
    expect(await Bun.file(path.join(runtimeRoot, "README.md")).text()).toContain(runtimeRoot);
  });

  test("re-running developer runtime init preserves existing instance data", async () => {
    const runtimeRoot = await createTempRoot("trenchclaw-dev-runtime-");
    const generatedRoot = await createTempRoot("trenchclaw-dev-generated-");

    await initializeDeveloperRuntime({
      runtimeRoot,
      generatedRoot,
      instanceId: "07",
      instanceName: "dev-seven",
    });
    await writeFile(path.join(runtimeRoot, "instances", "07", "settings", "ai.json"), '{"model":"tester-model"}\n', "utf8");
    await writeFile(path.join(runtimeRoot, "instances", "07", "secrets", "vault.json"), '{"wallet":"keep-me"}\n', "utf8");
    await writeFile(
      path.join(runtimeRoot, "instances", "07", "instance.json"),
      '{"instance":{"name":"sticky-name","localInstanceId":"07"}}\n',
      "utf8",
    );

    await initializeDeveloperRuntime({
      runtimeRoot,
      generatedRoot,
      instanceId: "07",
      instanceName: "new-name-should-not-overwrite",
    });

    expect(await Bun.file(path.join(runtimeRoot, "instances", "07", "settings", "ai.json")).text()).toContain("tester-model");
    expect(await Bun.file(path.join(runtimeRoot, "instances", "07", "secrets", "vault.json")).text()).toContain("keep-me");
    expect(await Bun.file(path.join(runtimeRoot, "instances", "07", "instance.json")).text()).toContain("sticky-name");
  });

  test("re-running developer runtime init migrates legacy auto-generated instance names", async () => {
    const runtimeRoot = await createTempRoot("trenchclaw-dev-runtime-");
    const generatedRoot = await createTempRoot("trenchclaw-dev-generated-");

    await initializeDeveloperRuntime({
      runtimeRoot,
      generatedRoot,
      instanceId: "01",
      instanceName: "dev-01",
    });
    await writeFile(
      path.join(runtimeRoot, "instances", "01", "instance.json"),
      JSON.stringify({
        instance: {
          name: "dev-01",
          localInstanceId: "01",
          userPin: null,
        },
        runtime: {
          safetyProfile: "dangerous",
          createdAt: "2026-03-19T00:00:00.000Z",
          updatedAt: "2026-03-19T00:00:00.000Z",
        },
      }, null, 2) + "\n",
      "utf8",
    );

    await initializeDeveloperRuntime({
      runtimeRoot,
      generatedRoot,
      instanceId: "01",
    });

    const instanceJson = JSON.parse(await readFile(path.join(runtimeRoot, "instances", "01", "instance.json"), "utf8")) as {
      instance: { name: string; localInstanceId: string };
    };
    expect(instanceJson.instance).toMatchObject({
      name: "default",
      localInstanceId: "01",
    });
  });

  test("clones selected instance parts into a developer runtime root", async () => {
    const sourceRoot = await createTempRoot("trenchclaw-dev-source-");
    const targetRoot = await createTempRoot("trenchclaw-dev-target-");
    const targetGeneratedRoot = await createTempRoot("trenchclaw-dev-target-generated-");

    await initializeDeveloperRuntime({
      runtimeRoot: sourceRoot,
      generatedRoot: await createTempRoot("trenchclaw-dev-source-generated-"),
      instanceId: "01",
      instanceName: "source",
    });
    await initializeDeveloperRuntime({
      runtimeRoot: targetRoot,
      generatedRoot: targetGeneratedRoot,
      instanceId: "09",
      instanceName: "target",
    });

    await writeFile(path.join(sourceRoot, "instances", "01", "settings", "ai.json"), '{"model":"dev-model"}\n', "utf8");
    await writeFile(path.join(sourceRoot, "instances", "01", "secrets", "vault.json"), '{"llm":{"openrouter":{"api-key":"secret"}}}\n', "utf8");
    await writeFile(path.join(sourceRoot, "instances", "01", "keypairs", "wallet-library.jsonl"), '{"walletId":"w1"}\n', "utf8");
    await writeFile(path.join(sourceRoot, "instances", "01", "data", "runtime.db"), "db-bytes\n", "utf8");
    await writeFile(path.join(sourceRoot, "instances", "01", "workspace", "notes", "memo.txt"), "workspace-note\n", "utf8");

    const result = await cloneDeveloperInstance({
      fromRoot: sourceRoot,
      toRoot: targetRoot,
      fromInstanceId: "01",
      toInstanceId: "09",
      parts: ["wallets", "settings", "db"],
    });

    expect(result.parts).toEqual(["wallets", "settings", "db"]);
    expect(await Bun.file(path.join(targetRoot, "instances", "09", "settings", "ai.json")).text()).toContain("dev-model");
    expect(await Bun.file(path.join(targetRoot, "instances", "09", "secrets", "vault.json")).text()).toContain("secret");
    expect(await Bun.file(path.join(targetRoot, "instances", "09", "keypairs", "wallet-library.jsonl")).text()).toContain("w1");
    expect(await Bun.file(path.join(targetRoot, "instances", "09", "data", "runtime.db")).text()).toContain("db-bytes");
    expect(await Bun.file(path.join(targetRoot, "instances", "09", "workspace", "notes", "memo.txt")).exists()).toBe(false);
  });

  test("developer bootstrap roots default to the persistent external dev runtime", () => {
    const defaults = getDefaultDeveloperRuntimeRoots();
    const resolved = resolveDeveloperBootstrapRoots({ env: {} });

    expect(resolved).toEqual(defaults);
  });
});
