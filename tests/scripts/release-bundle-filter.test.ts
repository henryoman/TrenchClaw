import { describe, expect, test } from "bun:test";

import { hasBlockedBundleContent, hasBlockedBundlePath, shouldBundleBrainFile } from "../../scripts/lib/release-bundle-filter";

describe("release-bundle-filter", () => {
  test("excludes runtime and secrets from brain bundle", () => {
    expect(shouldBundleBrainFile("apps/trenchclaw/src/ai/brain/protected/wallet-library.jsonl")).toBe(false);
    expect(shouldBundleBrainFile("apps/trenchclaw/src/ai/brain/db/runtime.sqlite")).toBe(false);
    expect(shouldBundleBrainFile("apps/trenchclaw/src/ai/brain/protected/keypairs/id.json")).toBe(false);
    expect(shouldBundleBrainFile("apps/trenchclaw/src/ai/brain/protected/keypairs/.keep")).toBe(true);
  });

  test("excludes skill installer shell scripts but keeps docs", () => {
    expect(shouldBundleBrainFile("apps/trenchclaw/src/ai/brain/knowledge/skills/helius/install.sh")).toBe(false);
    expect(shouldBundleBrainFile("apps/trenchclaw/src/ai/brain/knowledge/skills/helius/SKILL.md")).toBe(true);
    expect(shouldBundleBrainFile("apps/trenchclaw/src/ai/brain/knowledge/skills/helius/references/das.md")).toBe(false);
  });

  test("excludes beta-only deep vendor knowledge docs", () => {
    expect(shouldBundleBrainFile("apps/trenchclaw/src/ai/brain/knowledge/deep-knowledge/helius-docs-llms-full.md")).toBe(false);
  });

  test("flags blocked files in assembled bundle", () => {
    expect(hasBlockedBundlePath("core/src/ai/brain/knowledge/skills/helius/install.sh")).toContain(
      "skill installer scripts should not be bundled",
    );
    expect(hasBlockedBundlePath("core/src/ai/brain/db/runtime.sqlite")).toContain("runtime db/state file present");
    expect(hasBlockedBundlePath("core/src/ai/brain/knowledge/deep-knowledge/helius-docs-llms-full.md")).toContain(
      "deep vendor knowledge should not be bundled",
    );
    expect(hasBlockedBundlePath("core/src/ai/brain/knowledge/skills/helius/references/das.md")).toContain(
      "skill reference docs should not be bundled",
    );
    expect(hasBlockedBundlePath("core/src/ai/brain/knowledge/runtime-reference.md")).toBeNull();
    expect(hasBlockedBundlePath("core/.runtime/instances/00/instance.json")).toBeNull();
  });

  test("flags host-specific absolute paths in bundled file contents", () => {
    expect(
      hasBlockedBundleContent(
        "core/src/ai/brain/knowledge/example.md",
        "debug path: /Users/example/project",
        { blockedNeedles: ["/Users/example"] },
      ),
    ).toContain("host-specific absolute path");
    expect(
      hasBlockedBundleContent(
        "core/src/ai/brain/knowledge/example.md",
        "runtime root: /home/tester/app",
        { blockedNeedles: ["/Users/example"] },
      ),
    ).toBeNull();
    expect(
      hasBlockedBundleContent(
        "core/src/ai/brain/knowledge/example.md",
        "safe relative path: .runtime-state/instances/01/settings/ai.json",
        { blockedNeedles: ["/Users/example"] },
      ),
    ).toBeNull();
  });
});
