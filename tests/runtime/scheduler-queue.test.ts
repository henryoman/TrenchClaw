import { describe, expect, test } from "bun:test";
import { z } from "zod";

import {
  ActionDispatcher,
  ActionRegistry,
  InMemoryRuntimeEventBus,
  InMemoryStateStore,
  PolicyEngine,
  Scheduler,
} from "../../apps/trenchclaw/src/ai";
import { createActionContext } from "../../apps/trenchclaw/src/ai/runtime/types/context";
import type { JobState } from "../../apps/trenchclaw/src/ai/runtime/types/state";
import { actionSequenceRoutine } from "../../apps/trenchclaw/src/solana/routines/action-sequence";

describe("Scheduler queue dispatch", () => {
  test("runs queued actionSequence job and stores returned value", async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "echoForQueueTest",
      category: "data-based",
      subcategory: "read-only",
      inputSchema: z.object({
        value: z.string().min(1),
      }),
      execute: async (_ctx, input) => ({
        ok: true,
        retryable: false,
        data: {
          echoed: input.value,
        },
        durationMs: 1,
        timestamp: Date.now(),
        idempotencyKey: crypto.randomUUID(),
      }),
    });

    const stateStore = new InMemoryStateStore();
    const eventBus = new InMemoryRuntimeEventBus();
    const dispatcher = new ActionDispatcher({
      registry,
      policyEngine: new PolicyEngine([]),
      stateStore,
      eventBus,
    });
    const scheduler = new Scheduler(
      {
        stateStore,
        dispatcher,
        eventBus,
        createContext: (job) =>
          createActionContext({
            actor: "system",
            jobMeta: {
              jobId: job.id,
            },
          }),
        resolveRoutine: () => actionSequenceRoutine,
      },
      1,
    );
    scheduler.start();

    const now = Date.now();
    const job: JobState = {
      id: crypto.randomUUID(),
      botId: "queue-test",
      routineName: "actionSequence",
      status: "pending",
      config: {
        intervalMs: 60_000,
        steps: [
          {
            key: "echo",
            actionName: "echoForQueueTest",
            input: {
              value: "dispatcher-through-queue",
            },
          },
        ],
      },
      cyclesCompleted: 0,
      createdAt: now,
      updatedAt: now,
      nextRunAt: now,
    };
    stateStore.saveJob(job);

    await scheduler.tick(now);

    let updatedJob = stateStore.getJob(job.id);
    const waitDeadline = Date.now() + 1_000;
    while ((!updatedJob?.lastResult || updatedJob.lastResult.ok !== true) && Date.now() < waitDeadline) {
      await Bun.sleep(20);
      updatedJob = stateStore.getJob(job.id);
    }

    expect(updatedJob).not.toBeNull();
    expect(updatedJob?.lastResult?.ok).toBe(true);
    expect(updatedJob?.lastResult?.data).toEqual({
      echoed: "dispatcher-through-queue",
    });
    scheduler.stop();
  });
});
