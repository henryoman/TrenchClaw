import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { InMemoryStateStore } from "../../apps/trenchclaw/src/ai";
import type { LlmClient } from "../../apps/trenchclaw/src/ai/llm/types";
import { createRuntimeConversationId } from "../../apps/trenchclaw/src/ai/contracts/types/ids";
import { runWakeupCheckAction } from "../../apps/trenchclaw/src/tools/core/runWakeupCheck";
import { runtimeStatePath } from "../helpers/core-paths";

const createdInstanceRoots: string[] = [];

const createWakeupSettingsFile = async (input: {
  instanceId: string;
  savedAtUnixMs: number;
  intervalMinutes: number;
  prompt: string;
}): Promise<string> => {
  const instanceRoot = runtimeStatePath("instances", input.instanceId);
  createdInstanceRoots.push(instanceRoot);
  await mkdir(path.join(instanceRoot, "settings"), { recursive: true });
  await writeFile(
    path.join(instanceRoot, "settings", "wakeup.json"),
    `${JSON.stringify({
      configVersion: 1,
      savedAtUnixMs: input.savedAtUnixMs,
      wakeup: {
        intervalMinutes: input.intervalMinutes,
        prompt: input.prompt,
      },
    }, null, 2)}\n`,
    "utf8",
  );
  return instanceRoot;
};

const createLlm = (text: string): LlmClient => ({
  provider: "openrouter",
  model: "stepfun/step-3.5-flash:free",
  defaultSystemPrompt: "test",
  generate: async () => ({
    text,
    finishReason: "stop",
  }),
  stream: async () => ({
    textStream: (async function* streamText() {
      yield text;
    })(),
    consumeText: async () => text,
  }),
});

afterEach(async () => {
  for (const instanceRoot of createdInstanceRoots.splice(0)) {
    await rm(instanceRoot, { recursive: true, force: true });
  }
});

describe("runWakeupCheckAction", () => {
  test("persists a wakeup notice and keeps one anchored future wakeup job", async () => {
    const instanceId = "11";
    const savedAtUnixMs = Date.now();
    await createWakeupSettingsFile({
      instanceId,
      savedAtUnixMs,
      intervalMinutes: 10,
      prompt: "IF anything matters, say it. IF not, do nothing.",
    });

    const stateStore = new InMemoryStateStore();
    stateStore.saveJob({
      id: "job-failed-1",
      serialNumber: 1,
      botId: "ops",
      routineName: "actionSequence",
      status: "failed",
      config: {},
      cyclesCompleted: 0,
      createdAt: Date.now() - 2_000,
      updatedAt: Date.now() - 1_000,
      lastError: "rpc timeout",
    });

    const result = await runWakeupCheckAction.execute(
      {
        actor: "system",
        stateStore,
        llm: createLlm("There is a failed job that needs operator attention: actionSequence for ops last failed with rpc timeout."),
      },
      {
        instanceId,
        trigger: "scheduled",
      },
    );

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      instanceId,
      status: "notice",
      noticePersisted: true,
    });

    const conversationId = createRuntimeConversationId(instanceId);
    const messages = stateStore.listChatMessages(conversationId, 20);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.metadata?.kind).toBe("wakeup-notice");

    const wakeupJobs = stateStore
      .listJobs()
      .filter((job) => job.routineName === "runtimeWakeup" && job.status === "pending");
    expect(wakeupJobs).toHaveLength(1);
    expect(wakeupJobs[0]?.nextRunAt).toBe(savedAtUnixMs + 10 * 60_000);
    expect(wakeupJobs[0]?.config.intervalMs).toBe(10 * 60_000);
  });

  test("dedupes identical notices across wakeup runs", async () => {
    const instanceId = "12";
    const savedAtUnixMs = Date.now();
    await createWakeupSettingsFile({
      instanceId,
      savedAtUnixMs,
      intervalMinutes: 5,
      prompt: "IF anything matters, say it. IF not, do nothing.",
    });

    const stateStore = new InMemoryStateStore();
    const llm = createLlm("Operator attention needed: one failed job remains.");

    const first = await runWakeupCheckAction.execute(
      {
        actor: "system",
        stateStore,
        llm,
      },
      {
        instanceId,
        trigger: "scheduled",
      },
    );
    const second = await runWakeupCheckAction.execute(
      {
        actor: "system",
        stateStore,
        llm,
      },
      {
        instanceId,
        trigger: "scheduled",
      },
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.data?.status).toBe("notice");
    expect(second.data?.status).toBe("deduped");
    expect(stateStore.listChatMessages(createRuntimeConversationId(instanceId), 20)).toHaveLength(1);
    expect(
      stateStore
        .listJobs()
        .filter((job) => job.routineName === "runtimeWakeup" && job.status === "pending"),
    ).toHaveLength(1);
  });

  test("uses wakeup-specific guardrails in the llm system prompt", async () => {
    const instanceId = "13";
    const savedAtUnixMs = Date.now();
    await createWakeupSettingsFile({
      instanceId,
      savedAtUnixMs,
      intervalMinutes: 5,
      prompt: "Tell me if anything important happened.",
    });

    const stateStore = new InMemoryStateStore();
    const calls: Array<{ system?: string; prompt: string; mode?: string }> = [];
    const llm: LlmClient = {
      provider: "openrouter",
      model: "stepfun/step-3.5-flash:free",
      defaultSystemPrompt: "test",
      generate: async (input) => {
        calls.push({
          system: input.system,
          prompt: input.prompt,
          mode: input.mode,
        });
        return {
          text: "NO_NOTICE",
          finishReason: "stop",
        };
      },
      stream: async () => ({
        textStream: (async function* streamText() {
          yield "NO_NOTICE";
        })(),
        consumeText: async () => "NO_NOTICE",
      }),
    };

    const result = await runWakeupCheckAction.execute(
      {
        actor: "system",
        stateStore,
        llm,
      },
      {
        instanceId,
        trigger: "manual",
      },
    );

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.mode).toBe("runtime-wakeup");
    expect(calls[0]?.system).toContain("Wakeups can be triggered by a schedule, by boot-time recovery, or by a manual operator request.");
    expect(calls[0]?.system).toContain("This is an internal monitoring pass, not implied permission to trade, mutate state, or invent a user request.");
    expect(calls[0]?.system).toContain("Stay strictly scoped to the active instance.");
    expect(calls[0]?.system).toContain("Surface only concrete changes, failures, risks, or follow-up items that matter to the operator. Ignore routine noise.");
    expect(calls[0]?.prompt).toContain("Wakeup trigger: manual");
  });
});
