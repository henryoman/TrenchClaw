import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";

import { MemoryLogStore } from "../../../apps/trenchclaw/src/runtime/storage/memory-log-store";
import { runtimeStatePath } from "../../helpers/core-paths";

const tmpTargets: string[] = [];

const waitForFileText = async (filePath: string, timeoutMs = 2_000): Promise<string> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await Bun.file(filePath).exists()) {
      return Bun.file(filePath).text();
    }
    await Bun.sleep(25);
  }
  throw new Error(`Timed out waiting for file: ${filePath}`);
};

afterEach(async () => {
  for (const target of tmpTargets.splice(0)) {
    await Bun.$`rm -rf ${target}`.quiet();
  }
});

describe("MemoryLogStore", () => {
  test("writes daily and long-term memory logs", async () => {
    const root = path.resolve(
      runtimeStatePath("instances/01/cache/.tests"),
      `memory-${crypto.randomUUID()}`,
    );
    tmpTargets.push(root);

    const store = new MemoryLogStore({
      directory: `${root}/memory`,
      longTermFile: `${root}/memory/MEMORY.md`,
    });

    const dailyFile = store.appendDaily("- runtime started", "2026-02-24");
    const longTermFile = store.appendLongTerm("- learned thing");

    const dailyText = await waitForFileText(dailyFile);
    const longTermText = await waitForFileText(longTermFile);

    expect(dailyText.includes("runtime started")).toBe(true);
    expect(longTermText.includes("learned thing")).toBe(true);
  });
});
