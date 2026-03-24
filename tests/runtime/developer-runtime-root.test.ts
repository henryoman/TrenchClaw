import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  resolveDefaultWorkspaceRuntimeStateRoot,
  resolvePreferredWorkspaceRuntimeStateRoot,
} from "../../apps/trenchclaw/src/runtime/developer-runtime-root";

const createdRoots: string[] = [];

const createTempRoot = async (prefix: string): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  createdRoots.push(root);
  return root;
};

const writeMaterialVault = async (runtimeRoot: string, instanceId = "01"): Promise<void> => {
  const vaultPath = path.join(runtimeRoot, "instances", instanceId, "secrets", "vault.json");
  await mkdir(path.dirname(vaultPath), { recursive: true });
  await writeFile(vaultPath, `${JSON.stringify({
    llm: {
      openrouter: {
        "api-key": "test-key",
      },
    },
  }, null, 2)}\n`, "utf8");
};

afterEach(async () => {
  for (const root of createdRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("resolvePreferredWorkspaceRuntimeStateRoot", () => {
  test("defaults to the hidden external runtime root when no candidate contains material state", async () => {
    const homeRoot = await createTempRoot("trenchclaw-home-");
    const coreAppRoot = await createTempRoot("trenchclaw-core-app-");

    expect(resolvePreferredWorkspaceRuntimeStateRoot({
      coreAppRoot,
      env: {
        ...process.env,
        HOME: homeRoot,
        USERPROFILE: homeRoot,
      },
    })).toBe(resolveDefaultWorkspaceRuntimeStateRoot({
      ...process.env,
      HOME: homeRoot,
      USERPROFILE: homeRoot,
    }));
  });

  test("prefers the hidden external runtime root when it contains material state", async () => {
    const homeRoot = await createTempRoot("trenchclaw-home-");
    const coreAppRoot = await createTempRoot("trenchclaw-core-app-");
    const hiddenRoot = resolveDefaultWorkspaceRuntimeStateRoot({
      ...process.env,
      HOME: homeRoot,
      USERPROFILE: homeRoot,
    });
    await writeMaterialVault(hiddenRoot);

    expect(resolvePreferredWorkspaceRuntimeStateRoot({
      coreAppRoot,
      env: {
        ...process.env,
        HOME: homeRoot,
        USERPROFILE: homeRoot,
      },
    })).toBe(hiddenRoot);
  });

});
