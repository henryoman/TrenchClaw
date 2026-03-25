import { describe, expect, test } from "bun:test";
import { zodSchema } from "ai";

import { InMemoryStateStore } from "../../../../apps/trenchclaw/src/ai";
import { createActionContext } from "../../../../apps/trenchclaw/src/ai/contracts/types/context";
import type { JobState } from "../../../../apps/trenchclaw/src/ai/contracts/types/state";
import { listUpcomingTradingJobs } from "../../../../apps/trenchclaw/src/automation/jobs/upcomingTradingJobs";
import { scheduleManagedSwapAction } from "../../../../apps/trenchclaw/src/tools/trading/scheduleManagedSwap";

describe("scheduleManagedSwapAction", () => {
  test("queues a flat one-off scheduled swap through the managed routine surface", async () => {
    const capturedInputs: Array<{
      botId: string;
      routineName: string;
      config?: Record<string, unknown>;
      executeAtUnixMs?: number;
      totalCycles?: number;
    }> = [];

    const before = Date.now();
    const result = await scheduleManagedSwapAction.execute(
      createActionContext({
        actor: "agent",
        enqueueJob: async (input) => {
          capturedInputs.push(input);
          const job: JobState = {
            id: `job-${capturedInputs.length}`,
            botId: input.botId,
            routineName: input.routineName,
            status: "pending",
            config: input.config ?? {},
            cyclesCompleted: 0,
            totalCycles: input.totalCycles,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            nextRunAt: input.executeAtUnixMs,
          };
          return job;
        },
      }),
      {
        kind: "swap_once",
        provider: "standard",
        executionMode: "inline_sleep",
        walletGroup: "core-wallets",
        walletName: "maker-1",
        inputCoin: "SOL",
        outputCoin: "USDC",
        amount: "0.25",
        amountUnit: "ui",
        whenIn: "60s",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data?.kind).toBe("swap_once");
    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0]?.routineName).toBe("actionSequence");
    expect(capturedInputs[0]?.executeAtUnixMs).toBeGreaterThanOrEqual(before + 55_000);
    expect(capturedInputs[0]?.config).toMatchObject({
      kind: "swap_once",
      swapProvider: "standard",
      steps: [
        {
          actionName: "managedSwap",
          input: {
            provider: "standard",
            walletGroup: "core-wallets",
            walletName: "maker-1",
            inputCoin: "SOL",
            outputCoin: "USDC",
            amount: "0.25",
          },
        },
      ],
    });
  });

  test("queues a flat DCA plan with simple repeating fields", async () => {
    const capturedInputs: Array<{
      botId: string;
      routineName: string;
      config?: Record<string, unknown>;
      executeAtUnixMs?: number;
      totalCycles?: number;
    }> = [];

    const result = await scheduleManagedSwapAction.execute(
      createActionContext({
        actor: "agent",
        enqueueJob: async (input) => {
          capturedInputs.push(input);
          const job: JobState = {
            id: `job-${capturedInputs.length}`,
            botId: input.botId,
            routineName: input.routineName,
            status: "pending",
            config: input.config ?? {},
            cyclesCompleted: 0,
            totalCycles: input.totalCycles,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            nextRunAt: input.executeAtUnixMs,
          };
          return job;
        },
      }),
      {
        kind: "dca",
        provider: "ultra",
        executionMode: "inline_sleep",
        walletGroup: "core-wallets",
        walletName: "maker-1",
        inputCoin: "SOL",
        outputCoin: "JUP",
        amount: "0.30",
        amountUnit: "ui",
        whenIn: "60s",
        installments: 3,
        every: "5s",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data?.kind).toBe("dca");
    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0]?.config).toMatchObject({
      kind: "dca",
      swapProvider: "ultra",
    });

    const configSteps = ((capturedInputs[0]?.config?.steps ?? []) as Array<Record<string, unknown>>);
    expect(configSteps.map((step) => step.actionName)).toEqual([
      "managedSwap",
      "sleep",
      "managedSwap",
      "sleep",
      "managedSwap",
    ]);
  });

  test("shows a future scheduled swap in the upcoming trading schedule", async () => {
    const stateStore = new InMemoryStateStore();
    let serialNumber = 0;
    const now = Date.now();

    const result = await scheduleManagedSwapAction.execute(
      createActionContext({
        actor: "agent",
        enqueueJob: async (input) => {
          const job: JobState = {
            id: `job-${serialNumber + 1}`,
            serialNumber: ++serialNumber,
            botId: input.botId,
            routineName: input.routineName,
            status: "pending",
            config: input.config ?? {},
            cyclesCompleted: 0,
            totalCycles: input.totalCycles,
            createdAt: now,
            updatedAt: now,
            nextRunAt: input.executeAtUnixMs,
          };
          stateStore.saveJob(job);
          return job;
        },
      }),
      {
        kind: "swap_once",
        routineId: "future-swap-schedule-check",
        provider: "standard",
        executionMode: "inline_sleep",
        walletGroup: "core-wallets",
        walletName: "maker-1",
        inputCoin: "SOL",
        outputCoin: "USDC",
        amount: "0.25",
        amountUnit: "ui",
        whenIn: "60s",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const upcoming = listUpcomingTradingJobs(stateStore, {
      now,
      limit: 10,
    });

    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]).toMatchObject({
      botId: "trading-routine:future-swap-schedule-check",
      routineName: "actionSequence",
      status: "pending",
      kind: "swap_once",
      swapProvider: "standard",
      stepCount: 1,
      summary: "managedSwap | SOL -> USDC | amount=0.25 | wallet=core-wallets.maker-1",
    });
    expect(upcoming[0]?.nextRunAt).toBeGreaterThan(now);
  });

  test("serializes to a top-level object JSON schema", async () => {
    const schema = zodSchema(scheduleManagedSwapAction.inputSchema as never);
    const jsonSchema = await schema.jsonSchema;

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe("object");
  });
});
