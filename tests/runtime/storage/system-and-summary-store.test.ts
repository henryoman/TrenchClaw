import { afterEach, describe, expect, test } from "bun:test";

import { RuntimeLogger } from "../../../src/runtime/logging";
import { SessionLogStore } from "../../../src/runtime/storage/session-log-store";
import { SessionSummaryStore } from "../../../src/runtime/storage/session-summary-store";
import { SystemLogStore } from "../../../src/runtime/storage/system-log-store";

const tmpTargets: string[] = [];

afterEach(async () => {
  for (const target of tmpTargets.splice(0)) {
    await Bun.$`rm -rf ${target}`.quiet();
  }
});

describe("SystemLogStore + SessionSummaryStore", () => {
  test("writes runtime logger entries to daily system log files", async () => {
    const root = `/tmp/trenchclaw-system-log-${crypto.randomUUID()}`;
    tmpTargets.push(root);

    const logger = new RuntimeLogger({
      level: "info",
      style: "human",
      pretty: true,
    });
    const systemLogStore = new SystemLogStore({
      directory: `${root}/system`,
    });
    const unsubscribe = logger.subscribe((entry) => {
      systemLogStore.append(entry);
    });

    logger.info("runtime:boot", { profile: "dangerous" });
    unsubscribe();

    const logPath = `${root}/system/${new Date().toISOString().slice(0, 10)}.log`;
    const content = await Bun.file(logPath).text();
    expect(content.includes("runtime:boot")).toBe(true);
    expect(content.includes("dangerous")).toBe(true);
  });

  test("creates compact markdown summaries for sessions", async () => {
    const root = `/tmp/trenchclaw-session-summary-${crypto.randomUUID()}`;
    tmpTargets.push(root);

    const sessions = new SessionLogStore({
      directory: `${root}/sessions`,
      agentId: "agent-1",
      sessionKey: "agent:agent-1:main",
      source: "runtime",
    });
    const active = await sessions.open();
    await sessions.appendMessage("system", "runtime started");
    await sessions.appendEvent("action:start", { actionName: "createWallets" });

    const stats = await sessions.getActiveSessionStats();
    expect(stats).not.toBeNull();
    if (!stats) {
      throw new Error("expected active session stats");
    }

    const summaryStore = new SessionSummaryStore({
      directory: `${root}/summaries`,
    });
    const summaryPath = await summaryStore.writeSummary({
      ...stats,
      profile: "dangerous",
      schedulerTickMs: 1000,
      registeredActions: ["createWallets"],
      pendingJobsAtStop: 0,
    });

    const markdown = await Bun.file(summaryPath).text();
    expect(summaryPath.endsWith(`${active.sessionId}.md`)).toBe(true);
    expect(markdown.includes("# Session Summary")).toBe(true);
    expect(markdown.includes("messageCount: 1")).toBe(true);
    expect(markdown.includes("eventCount: 1")).toBe(true);
  });
});
