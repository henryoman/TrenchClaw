import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";

import {
  FilesystemPermissionDeniedError,
  assertFilesystemAccessAllowed,
  resetFilesystemManifestCacheForTests,
} from "../../../apps/trenchclaw/src/runtime/security/filesystem-manifest";

const createdFiles: string[] = [];
const previousManifestFile = process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE;

const writeTempManifest = async (yaml: string): Promise<string> => {
  const target = `/tmp/trenchclaw-filesystem-manifest-${crypto.randomUUID()}.yaml`;
  await Bun.write(target, yaml);
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

describe("filesystem-manifest policy", () => {
  test("enforces read-only permission for model in matched rule", async () => {
    const root = `/tmp/trenchclaw-fs-policy-${crypto.randomUUID()}`;
    const manifestPath = await writeTempManifest(`
version: 1
defaults:
  model: none
  user: write
  system: write
rules:
  - path: ${root}
    model: read
`);
    process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE = manifestPath;

    await expect(
      assertFilesystemAccessAllowed({
        actor: "agent",
        targetPath: path.join(root, "session.jsonl"),
        operation: "read",
        reason: "inspect logs",
      }),
    ).resolves.toBeUndefined();

    await expect(
      assertFilesystemAccessAllowed({
        actor: "agent",
        targetPath: path.join(root, "session.jsonl"),
        operation: "write",
        reason: "mutate logs",
      }),
    ).rejects.toBeInstanceOf(FilesystemPermissionDeniedError);
  });

  test("prefers most specific matching rule", async () => {
    const root = `/tmp/trenchclaw-fs-policy-${crypto.randomUUID()}`;
    const manifestPath = await writeTempManifest(`
version: 1
defaults:
  model: none
  user: write
  system: write
rules:
  - path: ${root}
    model: read
  - path: ${root}/notes
    model: write
`);
    process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE = manifestPath;

    await expect(
      assertFilesystemAccessAllowed({
        actor: "agent",
        targetPath: path.join(root, "notes", "daily.md"),
        operation: "write",
        reason: "write notes",
      }),
    ).resolves.toBeUndefined();

    await expect(
      assertFilesystemAccessAllowed({
        actor: "agent",
        targetPath: path.join(root, "logs", "daily.jsonl"),
        operation: "write",
        reason: "write logs",
      }),
    ).rejects.toBeInstanceOf(FilesystemPermissionDeniedError);
  });
});
