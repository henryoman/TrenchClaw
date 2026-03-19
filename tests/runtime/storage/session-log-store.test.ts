import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";

import { SessionLogStore } from "../../../apps/trenchclaw/src/runtime/storage/session-log-store";
import { runtimeStatePath } from "../../helpers/core-paths";

const sessionDirs: string[] = [];

afterEach(async () => {
  for (const target of sessionDirs.splice(0)) {
    await Bun.$`rm -rf ${target}`.quiet();
  }
});

describe("SessionLogStore", () => {
  test("creates sessions index and per-session jsonl log", async () => {
    const directory = path.resolve(
      runtimeStatePath("instances/01/logs/.tests"),
      `session-log-${crypto.randomUUID()}`,
    );
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

    const index = JSON.parse(await Bun.file(`${directory}/index.json`).text()) as {
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

  test("reuses existing session file when runtime restarts with same session key", async () => {
    const directory = path.resolve(
      runtimeStatePath("instances/01/logs/.tests"),
      `session-log-${crypto.randomUUID()}`,
    );
    sessionDirs.push(directory);

    const first = new SessionLogStore({
      directory,
      agentId: "test-agent",
      sessionKey: "agent:test-agent:main",
      source: "test",
    });
    const firstActive = await first.open();
    await first.appendMessage("system", "first runtime");

    const second = new SessionLogStore({
      directory,
      agentId: "test-agent",
      sessionKey: "agent:test-agent:main",
      source: "test",
    });
    const secondActive = await second.open();
    await second.appendMessage("system", "second runtime");

    expect(secondActive.sessionId).toBe(firstActive.sessionId);
    expect(await Bun.file(firstActive.sessionFilePath).exists()).toBe(true);

    const index = JSON.parse(await Bun.file(`${directory}/index.json`).text()) as {
      sessions: Record<string, { sessionId: string }>;
    };
    expect(index.sessions["agent:test-agent:main"]?.sessionId).toBe(secondActive.sessionId);
  });

  test("creates a new session file when reuseSessionOnBoot is disabled", async () => {
    const directory = path.resolve(
      runtimeStatePath("instances/01/logs/.tests"),
      `session-log-${crypto.randomUUID()}`,
    );
    sessionDirs.push(directory);

    const first = new SessionLogStore({
      directory,
      agentId: "test-agent",
      sessionKey: "agent:test-agent:main",
      source: "test",
      reuseSessionOnBoot: false,
    });
    const firstActive = await first.open();
    await first.appendMessage("system", "first runtime");

    const second = new SessionLogStore({
      directory,
      agentId: "test-agent",
      sessionKey: "agent:test-agent:main",
      source: "test",
      reuseSessionOnBoot: false,
    });
    const secondActive = await second.open();
    await second.appendMessage("system", "second runtime");

    expect(secondActive.sessionId).not.toBe(firstActive.sessionId);
    expect(await Bun.file(firstActive.sessionFilePath).exists()).toBe(true);
    expect(await Bun.file(secondActive.sessionFilePath).exists()).toBe(true);
  });
});
