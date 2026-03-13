import { describe, expect, test } from "bun:test";

import { getRuntimeCapabilitySnapshot } from "../../apps/trenchclaw/src/runtime/capabilities";
import { loadRuntimeSettings } from "../../apps/trenchclaw/src/runtime/load";

describe("runtime capability snapshot", () => {
  test("safe profile exposes read-only workspace tools but not workspace writes", async () => {
    const settings = await loadRuntimeSettings("safe");
    const snapshot = await getRuntimeCapabilitySnapshot(settings);
    const modelToolNames = snapshot.modelTools.map((toolEntry) => toolEntry.name);

    expect(modelToolNames).toContain("workspaceBash");
    expect(modelToolNames).toContain("workspaceReadFile");
    expect(modelToolNames).not.toContain("workspaceWriteFile");
    expect(modelToolNames).not.toContain("createWallets");
  });
});
