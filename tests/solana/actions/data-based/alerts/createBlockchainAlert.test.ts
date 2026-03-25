import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createBlockchainAlertAction } from "../../../../../apps/trenchclaw/src/tools/market/createBlockchainAlert";
import { createActionContext } from "../../../../../apps/trenchclaw/src/ai";
import { resetFilesystemManifestCacheForTests } from "../../../../../apps/trenchclaw/src/runtime/security/filesystemManifest";
import { createPersistedTestInstance } from "../../../../helpers/instanceFixtures";
import { runtimeStatePath } from "../../../../helpers/corePaths";

const createdFiles: string[] = [];
const createdDirectories = new Set<string>();
const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
const previousManifestFile = process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE;

const writeTempManifest = async (yaml: string): Promise<string> => {
  const manifestPath = `/tmp/trenchclaw-create-blockchain-alert-${crypto.randomUUID()}.yaml`;
  await Bun.write(manifestPath, yaml);
  createdFiles.push(manifestPath);
  return manifestPath;
};

afterEach(async () => {
  resetFilesystemManifestCacheForTests();
  if (previousActiveInstanceId === undefined) {
    delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
  } else {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = previousActiveInstanceId;
  }
  if (previousManifestFile === undefined) {
    delete process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE;
  } else {
    process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE = previousManifestFile;
  }
  for (const filePath of createdFiles.splice(0)) {
    await Bun.$`rm -f ${filePath}`.quiet();
  }

  for (const directoryPath of createdDirectories) {
    await rm(directoryPath, { recursive: true, force: true });
  }
  createdDirectories.clear();
});

describe("createBlockchainAlertAction", () => {
  test("creates and stores an alert rule", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = "01";
    createdDirectories.add(await createPersistedTestInstance("01", { markActive: true }));
    const storageFilePath = path.resolve(
      runtimeStatePath("instances/01/workspace/strategies/.tests"),
      `alerts-${crypto.randomUUID()}.json`,
    );
    createdFiles.push(storageFilePath);
    process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE = await writeTempManifest(`
version: 1
defaults:
  model: none
  user: write
  system: write
rules:
  - path: ${path.dirname(storageFilePath)}
    model: write
`);

    const result = await createBlockchainAlertAction.execute(
      createActionContext({ actor: "agent" }),
      {
        chain: "solana",
        assetSymbol: "SOL",
        condition: {
          type: "priceAbove",
          threshold: 200,
        },
        notification: {
          channels: ["log"],
          cooldownMinutes: 10,
        },
        storageFilePath,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.data?.alert.assetSymbol).toBe("SOL");
    expect(result.data?.alert.condition).toEqual({
      type: "priceAbove",
      threshold: 200,
    });

    const saved = JSON.parse(await Bun.file(storageFilePath).text()) as Array<{ assetSymbol: string }>;
    expect(saved).toHaveLength(1);
    expect(saved[0]?.assetSymbol).toBe("SOL");
  });

  test("blocks writes outside manifest-allowed paths", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = "01";
    createdDirectories.add(await createPersistedTestInstance("01", { markActive: true }));
    const result = await createBlockchainAlertAction.execute(
      createActionContext({ actor: "agent" }),
      {
        chain: "solana",
        assetSymbol: "SOL",
        condition: {
          type: "priceAbove",
          threshold: 200,
        },
        notification: {
          channels: ["log"],
          cooldownMinutes: 10,
        },
        storageFilePath: `/tmp/trenchclaw-alert-${crypto.randomUUID()}.json`,
      },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Blocked (read|write) blockchain alert storage file/);
  });
});
