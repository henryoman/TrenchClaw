import { afterEach, describe, expect, test } from "bun:test";

import { SessionLogStore } from "../../../apps/trenchclaw/src/runtime/storage/session-log-store";

const sessionDirs: string[] = [];

afterEach(async () => {
  for (const target of sessionDirs.splice(0)) {
    await Bun.$`rm -rf ${target}`.quiet();
  }
});

describe("SessionLogStore", () => {
  test("creates sessions index and per-session jsonl log", async () => {
    const directory = `/tmp/trenchclaw-session-log-${crypto.randomUUID()}`;
    sessionDirs.push(directory);

    const store = new SessionLogStore({
      directory,
      agentId: "test-agent",
      sessionKey: "agent:test-agent:main",
      source: "test",
    });

    const active = await store.open();
    await store.appendMessage("system", "hello");
    await store.appendEvent("action:start", { actionName: "createWallets" });

    const index = JSON.parse(await Bun.file(`${directory}/sessions.json`).text()) as {
      sessions: Record<string, { sessionId: string; messageCount: number; eventCount: number }>;
    };
    const indexEntry = index.sessions["agent:test-agent:main"];
    expect(indexEntry).toBeDefined();
    expect(indexEntry?.sessionId).toBe(active.sessionId);
    expect(indexEntry?.messageCount).toBe(1);
    expect(indexEntry?.eventCount).toBe(1);

    const jsonl = await Bun.file(active.sessionFilePath).text();
    expect(jsonl.includes("\"type\":\"session\"")).toBe(true);
    expect(jsonl.includes("\"type\":\"message\"")).toBe(true);
    expect(jsonl.includes("\"type\":\"event\"")).toBe(true);
  });
});

