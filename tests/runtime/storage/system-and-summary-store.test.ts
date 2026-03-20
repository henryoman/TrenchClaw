import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";

import { RuntimeLogger, type RuntimeLogEntry } from "../../../apps/trenchclaw/src/runtime/logging/runtime-logger";
import { SessionLogStore } from "../../../apps/trenchclaw/src/runtime/storage/session-log-store";
import { SessionSummaryStore } from "../../../apps/trenchclaw/src/runtime/storage/session-summary-store";
import { SummaryLogStore, SystemLogStore } from "../../../apps/trenchclaw/src/runtime/storage/runtime-log-stores";
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

describe("SystemLogStore + SessionSummaryStore", () => {
  test("writes runtime logger entries to daily system log files", async () => {
    const root = path.resolve(
      runtimeStatePath("instances/01/logs/.tests"),
      `system-log-${crypto.randomUUID()}`,
    );
    tmpTargets.push(root);

    const logger = new RuntimeLogger({
      level: "info",
      style: "human",
      pretty: true,
    });
    const systemLogStore = new SystemLogStore({
      directory: `${root}/system`,
    });
    const unsubscribe = logger.subscribe((entry: RuntimeLogEntry) => {
      systemLogStore.append(entry);
    });

    logger.info("runtime:boot", { profile: "dangerous" });
    unsubscribe();

    const logPath = `${root}/system/${new Date().toISOString().slice(0, 10)}.system.jsonl`;
    const content = await waitForFileText(logPath);
    expect(content.includes("runtime:boot")).toBe(true);
    expect(content.includes("dangerous")).toBe(true);
  });

  test("creates structured JSON summaries for sessions", async () => {
    const root = path.resolve(
      runtimeStatePath("instances/01/logs/.tests"),
      `session-summary-${crypto.randomUUID()}`,
    );
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

    const summary = JSON.parse(await Bun.file(summaryPath).text()) as {
      sessionId: string;
      messageCount: number;
      eventCount: number;
      compactionLevel: string;
    };
    expect(summaryPath.endsWith(`${active.sessionId}.summary.json`)).toBe(true);
    expect(summary.sessionId).toBe(active.sessionId);
    expect(summary.messageCount).toBe(1);
    expect(summary.eventCount).toBe(1);
    expect(summary.compactionLevel).toBe("basic");
  });

  test("writes concise summary entries to daily files", async () => {
    const root = path.resolve(
      runtimeStatePath("instances/01/logs/.tests"),
      `runtime-summary-${crypto.randomUUID()}`,
    );
    tmpTargets.push(root);

    const summaryStore = new SummaryLogStore({
      directory: `${root}/summaries`,
    });
    summaryStore.append({
      timestamp: new Date().toISOString(),
      category: "trade",
      event: "trade:executed",
      details: { actionName: "ultraSwap", txSignature: "abc123" },
    });

    const logPath = `${root}/summaries/${new Date().toISOString().slice(0, 10)}.summary.jsonl`;
    const content = await waitForFileText(logPath);
    expect(content.includes("\"category\":\"trade\"")).toBe(true);
    expect(content.includes("trade:executed")).toBe(true);
    expect(content.includes("ultraSwap")).toBe(true);
  });
});
