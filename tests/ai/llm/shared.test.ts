import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolvePreferredPathFromModule } from "../../../apps/trenchclaw/src/ai/llm/shared";

const createdDirectories: string[] = [];

afterEach(async () => {
  for (const directoryPath of createdDirectories.splice(0)) {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

describe("resolvePreferredPathFromModule", () => {
  test("preserves legacy path priority when multiple fallback files exist", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "trenchclaw-llm-shared-"));
    createdDirectories.push(tempDir);
    const moduleUrl = pathToFileURL(path.join(tempDir, "module.ts")).href;
    const firstLegacyPath = path.join(tempDir, "legacy-a.json");
    const secondLegacyPath = path.join(tempDir, "legacy-b.json");

    await Bun.write(firstLegacyPath, "{}\n");
    await Bun.write(secondLegacyPath, "{}\n");

    await expect(resolvePreferredPathFromModule({
      moduleUrl,
      preferredRelativePath: "./preferred.json",
      legacyRelativePaths: ["./legacy-a.json", "./legacy-b.json"],
    })).resolves.toBe(firstLegacyPath);
  });
});
