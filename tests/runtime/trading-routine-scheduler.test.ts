import { describe, expect, test } from "bun:test";
import os from "node:os";
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
import { createActionContext } from "../../apps/trenchclaw/src/ai/contracts/types/context";
import type { JobState } from "../../apps/trenchclaw/src/ai/contracts/types/state";
import { actionSequenceRoutine } from "../../apps/trenchclaw/src/solana/routines/action-sequence";
import { submitTradingRoutineAction } from "../../apps/trenchclaw/src/solana/actions/data-fetch/runtime/submitTradingRoutine";

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

describe("scheduled trading routines", () => {
  test("executes a future swap_once routine when its run time arrives", async () => {
    const stateStore = new InMemoryStateStore();
    const eventBus = new InMemoryRuntimeEventBus();
    const registry = new ActionRegistry();
    const executedAt: number[] = [];

    registry.register({
      name: "managedSwap",
      category: "wallet-based",
      subcategory: "swap",
      inputSchema: z.object({
        provider: z.enum(["ultra"]),
        inputCoin: z.string(),
        outputCoin: z.string(),
        amount: z.union([z.number(), z.string()]),
      }).passthrough(),
      execute: async (_ctx, input) => {
        executedAt.push(Date.now());
        return {
          ok: true,
          retryable: false,
          data: {
            provider: input.provider,
            inputCoin: input.inputCoin,
            outputCoin: input.outputCoin,
            amount: input.amount,
            status: "executed",
          },
          durationMs: 1,
          timestamp: Date.now(),
          idempotencyKey: crypto.randomUUID(),
        };
      },
    });

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
            actor: "agent",
            jobMeta: {
              jobId: job.id,
              botId: job.botId,
              routineName: job.routineName,
            },
          }),
        resolveRoutine: () => actionSequenceRoutine,
      },
      1,
      {
        dataPath: path.join(os.tmpdir(), `scheduled-trading-routine-${crypto.randomUUID()}.sqlite`),
        queueName: `scheduled-trading-routine-${crypto.randomUUID()}`,
      },
    );

    scheduler.start();
    try {
      const now = Date.now();
      let serial = 0;
      const enqueueJob = async (input: {
        botId: string;
        routineName: string;
        config?: Record<string, unknown>;
        totalCycles?: number;
        executeAtUnixMs?: number;
      }): Promise<JobState> => {
        const job: JobState = {
          id: crypto.randomUUID(),
          serialNumber: ++serial,
          botId: input.botId,
          routineName: input.routineName,
          status: "pending",
          config: input.config ?? {},
          cyclesCompleted: 0,
          totalCycles: input.totalCycles ?? 1,
          createdAt: now,
          updatedAt: now,
          nextRunAt: input.executeAtUnixMs,
        };
        stateStore.saveJob(job);
        return job;
      };

      const submitResult = await submitTradingRoutineAction.execute(
        createActionContext({
          actor: "agent",
          enqueueJob,
        }),
        {
          version: 1,
          kind: "swap_once",
          executeAtUnixMs: now + 60_000,
          routineId: "future-trade-1",
          swap: {
            provider: "ultra",
            wallet: "maker_1",
            inputCoin: "SOL",
            outputCoin: "JUP",
            amount: "0.25",
            amountUnit: "ui",
          },
        },
      );

      expect(submitResult.ok).toBe(true);
      if (!submitResult.ok) {
        return;
      }

      const jobId = submitResult.data?.jobs[0]?.id;
      expect(jobId).toBeDefined();
      expect(executedAt).toHaveLength(0);

      await scheduler.tick(now);
      expect(executedAt).toHaveLength(0);

      await scheduler.tick(now + 60_000);
      const finalJob = await waitForJobResult(stateStore, jobId!);

      expect(executedAt).toHaveLength(1);
      expect(finalJob?.status).toBe("stopped");
      expect(finalJob?.lastResult?.ok).toBe(true);
      expect(finalJob?.lastResult?.data).toMatchObject({
        provider: "ultra",
        inputCoin: "SOL",
        outputCoin: "JUP",
        amount: "0.25",
      });
    } finally {
      await scheduler.stop();
    }
  });

  test("executes a future micro round-trip routine in order", async () => {
    const stateStore = new InMemoryStateStore();
    const eventBus = new InMemoryRuntimeEventBus();
    const registry = new ActionRegistry();
    const executedSteps: string[] = [];

    registry.register({
      name: "managedSwap",
      category: "wallet-based",
      subcategory: "swap",
      inputSchema: z.object({
        provider: z.enum(["ultra"]),
        inputCoin: z.string(),
        outputCoin: z.string(),
        amount: z.union([z.number(), z.string()]),
      }).passthrough(),
      execute: async (_ctx, input) => {
        executedSteps.push(`${input.inputCoin}->${input.outputCoin}:${String(input.amount)}`);
        return {
          ok: true,
          retryable: false,
          data: {
            provider: input.provider,
            inputCoin: input.inputCoin,
            outputCoin: input.outputCoin,
            amount: input.amount,
          },
          durationMs: 1,
          timestamp: Date.now(),
          idempotencyKey: crypto.randomUUID(),
        };
      },
    });

    registry.register({
      name: "sleep",
      category: "data-based",
      inputSchema: z.object({
        waitMs: z.number().int().nonnegative(),
      }),
      execute: async (_ctx, input) => {
        executedSteps.push(`sleep:${input.waitMs}`);
        return {
          ok: true,
          retryable: false,
          data: input,
          durationMs: 1,
          timestamp: Date.now(),
          idempotencyKey: crypto.randomUUID(),
        };
      },
    });

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
            actor: "agent",
            jobMeta: {
              jobId: job.id,
              botId: job.botId,
              routineName: job.routineName,
            },
          }),
        resolveRoutine: () => actionSequenceRoutine,
      },
      1,
      {
        dataPath: path.join(os.tmpdir(), `scheduled-roundtrip-${crypto.randomUUID()}.sqlite`),
        queueName: `scheduled-roundtrip-${crypto.randomUUID()}`,
      },
    );

    scheduler.start();
    try {
      const now = Date.now();
      let serial = 0;
      const enqueueJob = async (input: {
        botId: string;
        routineName: string;
        config?: Record<string, unknown>;
        totalCycles?: number;
        executeAtUnixMs?: number;
      }): Promise<JobState> => {
        const job: JobState = {
          id: crypto.randomUUID(),
          serialNumber: ++serial,
          botId: input.botId,
          routineName: input.routineName,
          status: "pending",
          config: input.config ?? {},
          cyclesCompleted: 0,
          totalCycles: input.totalCycles ?? 1,
          createdAt: now,
          updatedAt: now,
          nextRunAt: input.executeAtUnixMs,
        };
        stateStore.saveJob(job);
        return job;
      };

      const submitResult = await submitTradingRoutineAction.execute(
        createActionContext({
          actor: "agent",
          enqueueJob,
        }),
        {
          version: 1,
          kind: "action_sequence",
          executeAtUnixMs: now + 60_000,
          routineId: "future-roundtrip-1",
          steps: [
            {
              kind: "swap",
              key: "buy-usdc",
              swap: {
                provider: "ultra",
                wallet: "maker_1",
                inputCoin: "SOL",
                outputCoin: "USDC",
                amount: "0.000001",
                amountUnit: "ui",
              },
            },
            {
              kind: "sleep",
              key: "wait-a-bit",
              dependsOn: "buy-usdc",
              waitMs: 30_000,
            },
            {
              kind: "swap",
              key: "sell-back",
              dependsOn: "wait-a-bit",
              swap: {
                provider: "ultra",
                wallet: "maker_1",
                inputCoin: "USDC",
                outputCoin: "SOL",
                amount: "100%",
              },
            },
          ],
        },
      );

      expect(submitResult.ok).toBe(true);
      if (!submitResult.ok) {
        return;
      }

      const jobId = submitResult.data?.jobs[0]?.id;
      expect(jobId).toBeDefined();

      await scheduler.tick(now);
      expect(executedSteps).toHaveLength(0);

      await scheduler.tick(now + 60_000);
      const finalJob = await waitForJobResult(stateStore, jobId!);

      expect(executedSteps).toEqual([
        "SOL->USDC:0.000001",
        "sleep:30000",
        "USDC->SOL:100%",
      ]);
      expect(finalJob?.status).toBe("stopped");
      expect(finalJob?.lastResult?.ok).toBe(true);
      expect(finalJob?.lastResult?.data).toMatchObject({
        provider: "ultra",
        inputCoin: "USDC",
        outputCoin: "SOL",
        amount: "100%",
      });
    } finally {
      await scheduler.stop();
    }
  });
});
