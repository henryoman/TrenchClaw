import { afterEach, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
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
const RUNTIME_CACHE_DIRECTORY = runtimeStatePath("instances/01/cache");
const RUNTIME_INSTANCE_DIRECTORY = runtimeStatePath("instances");
const createTestQueueDbPath = (): string =>
  path.join(RUNTIME_CACHE_DIRECTORY, `.tests/trenchclaw-scheduler-queue-${crypto.randomUUID()}.sqlite`);

const ensurePersistedInstance = async (instanceId = "01"): Promise<void> => {
  const instanceRoot = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
  await mkdir(instanceRoot, { recursive: true });
  await Bun.write(
    path.join(RUNTIME_INSTANCE_DIRECTORY, "active-instance.json"),
    `${JSON.stringify({ localInstanceId: instanceId }, null, 2)}\n`,
  );
  await Bun.write(
    path.join(instanceRoot, "instance.json"),
    `${JSON.stringify({
      instance: {
        name: `instance-${instanceId}`,
        localInstanceId: instanceId,
        userPin: null,
      },
      runtime: {
        safetyProfile: "dangerous",
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z",
      },
    }, null, 2)}\n`,
  );
};

afterEach(async () => {
  delete process.env.DATA_PATH;
  delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
  for (const dbPath of queueDbPaths.splice(0)) {
    await Bun.file(dbPath).delete().catch(() => {});
    await Bun.file(`${dbPath}-wal`).delete().catch(() => {});
    await Bun.file(`${dbPath}-shm`).delete().catch(() => {});
  }
  await Bun.file(path.join(RUNTIME_INSTANCE_DIRECTORY, "active-instance.json")).delete().catch(() => {});
  await Bun.$`rm -rf ${path.join(RUNTIME_INSTANCE_DIRECTORY, "01")}`.quiet();
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
  test("defaults embedded queue storage to the active instance cache directory", async () => {
    await ensurePersistedInstance("01");
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = "01";
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
      expect(process.env.DATA_PATH).toBe(runtimeStatePath("instances/01/cache/queue.sqlite"));
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

  test("promotes scheduled jobs into the queue only after their run time", async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: "echoForDelayedQueueTest",
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
    const queueName = `scheduler-delay-test-${crypto.randomUUID()}`;
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
      botId: "queue-delay-test",
      routineName: "actionSequence",
      status: "pending",
      config: {
        steps: [
          {
            key: "echo",
            actionName: "echoForDelayedQueueTest",
            input: {
              value: "delay-confirmed",
            },
          },
        ],
      },
      cyclesCompleted: 0,
      totalCycles: 1,
      createdAt: now,
      updatedAt: now,
      nextRunAt: now + 250,
    };
    stateStore.saveJob(job);

    await scheduler.tick(now);
    await Bun.sleep(75);
    const beforeDue = stateStore.getJob(job.id);
    expect(beforeDue?.status).toBe("pending");
    expect(beforeDue?.lastResult).toBeUndefined();

    await scheduler.tick(now + 250);
    const updatedJob = await waitForJobResult(stateStore, job.id);

    expect(updatedJob).not.toBeNull();
    expect(updatedJob?.status).toBe("stopped");
    expect(updatedJob?.lastResult?.ok).toBe(true);
    expect(updatedJob?.lastResult?.data).toEqual({
      echoed: "delay-confirmed",
    });
    await scheduler.stop();
  });

  test("marks queued jobs as failed when they reference an unsupported action", async () => {
    const stateStore = new InMemoryStateStore();
    const eventBus = new InMemoryRuntimeEventBus();
    const dispatcher = new ActionDispatcher({
      registry: new ActionRegistry(),
      policyEngine: new PolicyEngine([]),
      stateStore,
      eventBus,
    });
    const queueDbPath = createTestQueueDbPath();
    queueDbPaths.push(queueDbPath);
    const queueName = `scheduler-unsupported-action-test-${crypto.randomUUID()}`;
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
      botId: "queue-unsupported-action-test",
      routineName: "actionSequence",
      status: "pending",
      config: {
        steps: [
          {
            key: "removed",
            actionName: "managedTriggerOrder",
            input: {
              walletGroup: "core-wallets",
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
    const waitDeadline = Date.now() + 1_000;
    let updatedJob = stateStore.getJob(job.id);
    while (updatedJob?.status !== "failed" && Date.now() < waitDeadline) {
      await Bun.sleep(20);
      updatedJob = stateStore.getJob(job.id);
    }

    expect(updatedJob?.status).toBe("failed");
    expect(updatedJob?.lastResult?.ok).toBe(false);
    expect(updatedJob?.lastResult?.code).toBe("unsupported_action");
    expect(updatedJob?.lastResult?.error).toContain("not supported by this runtime");
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
