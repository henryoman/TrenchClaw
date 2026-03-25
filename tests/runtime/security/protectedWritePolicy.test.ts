import { afterEach, describe, expect, test } from "bun:test";

import {
  ProtectedWriteForbiddenError,
  assertProtectedReadAllowed,
  assertProtectedWriteAllowed,
} from "../../../apps/trenchclaw/src/runtime/security/protectedWritePolicy";
import { resetFilesystemManifestCacheForTests } from "../../../apps/trenchclaw/src/runtime/security/filesystemManifest";

const createdFiles: string[] = [];
const previousManifestFile = process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE;

const writeTempManifest = async (content: string): Promise<string> => {
  const target = `/tmp/trenchclaw-protected-policy-${crypto.randomUUID()}.json`;
  await Bun.write(target, content);
  createdFiles.push(target);
  return target;
};

afterEach(async () => {
  resetFilesystemManifestCacheForTests();
  if (previousManifestFile === undefined) {
    delete process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE;
  } else {
    process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE = previousManifestFile;
  }

  for (const filePath of createdFiles.splice(0)) {
    await Bun.$`rm -f ${filePath}`.quiet();
  }
});

describe("protected-write-policy", () => {
  test("rejects writes outside protected directory even if manifest allows", async () => {
    const manifestPath = await writeTempManifest(`{
  "version": 1,
  "defaults": {
    "model": "write",
    "user": "write",
    "system": "write"
  },
  "rules": []
}`);
    process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE = manifestPath;

    await expect(
      assertProtectedWriteAllowed({
        actor: "agent",
        targetPath: ".runtime/user/outside-protected.md",
        operation: "write outside protected root",
      }),
    ).rejects.toBeInstanceOf(ProtectedWriteForbiddenError);
  });

  test("allows model read from log directories when manifest grants read", async () => {
    const manifestPath = await writeTempManifest(`{
  "version": 1,
  "defaults": {
    "model": "none",
    "user": "write",
    "system": "write"
  },
  "rules": [
    {
      "path": ".runtime-state/instances",
      "model": "read"
    }
  ]
}`);
    process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE = manifestPath;

    await expect(
      assertProtectedReadAllowed({
        actor: "agent",
        targetPath: ".runtime-state/instances/01/logs/sessions/index.json",
        operation: "read session index",
      }),
    ).resolves.toBeUndefined();
  });
});
