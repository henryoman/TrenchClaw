import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildKnowledgeInventory, renderDirectoryTree } from "../../../apps/trenchclaw/src/ai/brain/knowledge-index";

const createdDirectories: string[] = [];

afterEach(async () => {
  for (const directoryPath of createdDirectories.splice(0)) {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

describe("knowledge index helpers", () => {
  test("builds a deterministic inventory for nested docs and skill packs", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "trenchclaw-knowledge-index-"));
    createdDirectories.push(tempDir);

    await mkdir(path.join(tempDir, "deep-knowledge"), { recursive: true });
    await mkdir(path.join(tempDir, "skills", "wallets", "references"), { recursive: true });
    await Bun.write(path.join(tempDir, "runtime-reference.md"), "# Runtime\n");
    await Bun.write(path.join(tempDir, "deep-knowledge", "advanced.md"), "# Advanced\n");
    await Bun.write(path.join(tempDir, "skills", "wallets", "SKILL.md"), "# Wallets\n");
    await Bun.write(path.join(tempDir, "skills", "wallets", "guide.md"), "# Guide\n");
    await Bun.write(path.join(tempDir, "skills", "wallets", "references", "ref.md"), "# Ref\n");

    const inventory = await buildKnowledgeInventory(tempDir);
    const tree = await renderDirectoryTree(tempDir);

    expect(inventory.coreDocs.map((entry) => entry.path)).toEqual(["src/ai/brain/knowledge/runtime-reference.md"]);
    expect(inventory.deepDocs.map((entry) => entry.path)).toEqual(["src/ai/brain/knowledge/deep-knowledge/advanced.md"]);
    expect(inventory.supportDocs.map((entry) => entry.path)).toEqual(["src/ai/brain/knowledge/skills/wallets/guide.md"]);
    expect(inventory.skillPacks).toEqual([
      expect.objectContaining({
        path: "src/ai/brain/knowledge/skills/wallets/SKILL.md",
        referenceCount: 1,
      }),
    ]);
    expect(tree).toContain("deep-knowledge/");
    expect(tree).toContain("skills/");
  });
});
