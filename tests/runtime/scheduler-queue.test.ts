import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
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
import { runtimeStatePath } from "../helpers/core-paths";

const queueDbPaths: string[] = [];
const RUNTIME_DB_DIRECTORY = runtimeStatePath("db");
const createTestQueueDbPath = (): string =>
  path.join(RUNTIME_DB_DIRECTORY, `trenchclaw-scheduler-queue-${crypto.randomUUID()}.sqlite`);

afterEach(() => {
  delete process.env.DATA_PATH;
  for (const dbPath of queueDbPaths.splice(0)) {
    void Bun.file(dbPath).delete().catch(() => {});
    void Bun.file(`${dbPath}-wal`).delete().catch(() => {});
    void Bun.file(`${dbPath}-shm`).delete().catch(() => {});
  }
});

const waitForJobResult = async (
  stateStore: InMemoryStateStore,
  jobId: string,
): Promise<JobState | null> => {
  let updatedJob = stateStore.getJob(jobId);
  const waitDeadline = Date.now() + 1_000;
  while ((!updatedJob?.lastResult || updatedJob.lastResult.ok !== true) && Date.now() < waitDeadline) {
    await Bun.sleep(20);
    updatedJob = stateStore.getJob(jobId);
  }
  return updatedJob;
};

describe("Scheduler queue dispatch", () => {
  test("defaults embedded queue storage to the runtime-state db directory", async () => {
    const scheduler = new Scheduler(
      {
        stateStore: new InMemoryStateStore(),
        dispatcher: new ActionDispatcher({
          registry: new ActionRegistry(),
          policyEngine: new PolicyEngine([]),
          stateStore: new InMemoryStateStore(),
          eventBus: new InMemoryRuntimeEventBus(),
        }),
        eventBus: new InMemoryRuntimeEventBus(),
        createContext: () => createActionContext({ actor: "system" }),
        resolveRoutine: () => actionSequenceRoutine,
      },
      1,
    );

    scheduler.start();
    try {
      expect(process.env.DATA_PATH).toBe(runtimeStatePath("db/queue/bunqueue.sqlite"));
    } finally {
      await scheduler.stop();
    }
  });

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
    const queueDbPath = createTestQueueDbPath();
    queueDbPaths.push(queueDbPath);
    const queueName = `scheduler-queue-test-${crypto.randomUUID()}`;
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
      {
        dataPath: queueDbPath,
        queueName,
      },
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
      totalCycles: 1,
      createdAt: now,
      updatedAt: now,
      nextRunAt: now,
    };
    stateStore.saveJob(job);

    await scheduler.tick(now);
    const updatedJob = await waitForJobResult(stateStore, job.id);

    expect(updatedJob).not.toBeNull();
    expect(updatedJob?.lastResult?.ok).toBe(true);
    expect(updatedJob?.lastResult?.data).toEqual({
      echoed: "dispatcher-through-queue",
    });
    await scheduler.stop();
  });

  test("tryStartJob claims the same pending cycle only once", () => {
    const stateStore = new InMemoryStateStore();
    const now = Date.now();
    const job: JobState = {
      id: crypto.randomUUID(),
      serialNumber: stateStore.reserveJobSerialNumber(),
      botId: "queue-claim-test",
      routineName: "actionSequence",
      status: "pending",
      config: {},
      cyclesCompleted: 0,
      createdAt: now,
      updatedAt: now,
      nextRunAt: now,
    };
    stateStore.saveJob(job);

    const firstClaim = stateStore.tryStartJob({
      id: job.id,
      expectedCycle: 1,
      leaseOwner: "test-worker-1",
      leaseExpiresAt: now + 60_000,
    });
    const secondClaim = stateStore.tryStartJob({
      id: job.id,
      expectedCycle: 1,
      leaseOwner: "test-worker-2",
      leaseExpiresAt: now + 60_000,
    });

    expect(firstClaim?.status).toBe("running");
    expect(firstClaim?.leaseOwner).toBe("test-worker-1");
    expect(secondClaim).toBeNull();
  });
});
