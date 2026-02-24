import { afterEach, describe, expect, test } from "bun:test";

import { MemoryLogStore } from "../../../src/runtime/storage/memory-log-store";

const tmpTargets: string[] = [];

afterEach(async () => {
  for (const target of tmpTargets.splice(0)) {
    await Bun.$`rm -rf ${target}`.quiet();
  }
});

describe("MemoryLogStore", () => {
  test("writes daily and long-term memory logs", async () => {
    const root = `/tmp/trenchclaw-memory-${crypto.randomUUID()}`;
    tmpTargets.push(root);

    const store = new MemoryLogStore({
      directory: `${root}/memory`,
      longTermFile: `${root}/memory/MEMORY.md`,
    });

    const dailyFile = store.appendDaily("- runtime started", "2026-02-24");
    const longTermFile = store.appendLongTerm("- learned thing");

    const dailyText = await Bun.file(dailyFile).text();
    const longTermText = await Bun.file(longTermFile).text();

    expect(dailyText.includes("runtime started")).toBe(true);
    expect(longTermText.includes("learned thing")).toBe(true);
  });
});

