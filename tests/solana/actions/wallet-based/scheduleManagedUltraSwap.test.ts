import { describe, expect, test } from "bun:test";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/contracts/types/context";
import type { JobState } from "../../../../apps/trenchclaw/src/ai/contracts/types/state";
import { scheduleManagedUltraSwapAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/swap/ultra/scheduleManagedSwap";

describe("scheduleManagedUltraSwapAction", () => {
  test("queues a single future managed Ultra swap", async () => {
    let capturedInput:
      | {
          botId: string;
          routineName: string;
          config?: Record<string, unknown>;
          totalCycles?: number;
          executeAtUnixMs?: number;
        }
      | undefined;
    const executeAtUnixMs = Date.now() + 60_000;

    const result = await scheduleManagedUltraSwapAction.execute(
      createActionContext({
        actor: "agent",
        enqueueJob: async (input) => {
          capturedInput = input;
          const job: JobState = {
            id: "job-once-1",
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
        wallet: "maker_1",
        swapType: "ultra",
        inputCoin: "SOL",
        outputCoin: "JUP",
        amount: "0.15",
        amountUnit: "ui",
        schedule: {
          kind: "once",
          executeAtUnixMs,
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(capturedInput?.routineName).toBe("actionSequence");
    expect(capturedInput?.executeAtUnixMs).toBe(executeAtUnixMs);
    expect(result.data?.steps).toHaveLength(1);
    expect(result.data?.steps[0]).toMatchObject({
      key: "swap-1",
      actionName: "managedUltraSwap",
      input: {
        wallet: "maker_1",
        inputCoin: "SOL",
        outputCoin: "JUP",
        amount: "0.15",
      },
    });
  });

  test("builds an equal-interval DCA action sequence", async () => {
    let capturedInput:
      | {
          botId: string;
          routineName: string;
          config?: Record<string, unknown>;
          totalCycles?: number;
          executeAtUnixMs?: number;
        }
      | undefined;
    const startAtUnixMs = Date.now() + 120_000;
    const endAtUnixMs = startAtUnixMs + 6_000;

    const result = await scheduleManagedUltraSwapAction.execute(
      createActionContext({
        actor: "agent",
        enqueueJob: async (input) => {
          capturedInput = input;
          const job: JobState = {
            id: "job-dca-1",
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
        wallet: "maker_1",
        swapType: "ultra",
        inputCoin: "SOL",
        outputCoin: "JUP",
        amount: "0.3",
        amountUnit: "ui",
        schedule: {
          kind: "dca",
          installments: 3,
          startAtUnixMs,
          endAtUnixMs,
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(capturedInput?.routineName).toBe("actionSequence");
    expect(capturedInput?.executeAtUnixMs).toBe(startAtUnixMs);
    expect(result.data?.schedule).toEqual({
      kind: "dca",
      installments: 3,
      intervalMs: 3000,
    });
    expect(result.data?.steps).toHaveLength(5);
    expect(result.data?.steps.map((step) => step.actionName)).toEqual([
      "managedUltraSwap",
      "sleep",
      "managedUltraSwap",
      "sleep",
      "managedUltraSwap",
    ]);
    expect(result.data?.steps[0]?.input).toMatchObject({ amount: "0.1" });
    expect(result.data?.steps[1]?.input).toMatchObject({ waitMs: 3000 });
    expect(result.data?.steps[2]?.input).toMatchObject({ amount: "0.1" });
    expect(result.data?.steps[3]?.input).toMatchObject({ waitMs: 3000 });
    expect(result.data?.steps[4]?.input).toMatchObject({ amount: "0.1" });
  });

  test("accepts relative once schedules and second-based DCA interval strings", async () => {
    const capturedInputs: Array<{
      botId: string;
      routineName: string;
      config?: Record<string, unknown>;
      totalCycles?: number;
      executeAtUnixMs?: number;
    }> = [];
    const before = Date.now();

    const onceResult = await scheduleManagedUltraSwapAction.execute(
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
        wallet: "maker_1",
        swapType: "ultra",
        inputCoin: "SOL",
        outputCoin: "JUP",
        amount: "0.15",
        amountUnit: "ui",
        schedule: {
          kind: "once",
          executeIn: "60s",
        },
      },
    );
    const after = Date.now();

    expect(onceResult.ok).toBe(true);
    if (!onceResult.ok) {
      return;
    }
    expect(capturedInputs[0]?.executeAtUnixMs ?? 0).toBeGreaterThanOrEqual(before + 60_000);
    expect(capturedInputs[0]?.executeAtUnixMs ?? 0).toBeLessThanOrEqual(after + 60_000);

    const dcaResult = await scheduleManagedUltraSwapAction.execute(
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
        wallet: "maker_1",
        swapType: "ultra",
        inputCoin: "SOL",
        outputCoin: "USDC",
        amount: "0.000003",
        amountUnit: "ui",
        schedule: {
          kind: "dca",
          installments: 3,
          startIn: "60s",
          interval: "3s",
        },
      },
    );

    expect(dcaResult.ok).toBe(true);
    if (!dcaResult.ok) {
      return;
    }
    expect(dcaResult.data?.schedule).toEqual({
      kind: "dca",
      installments: 3,
      intervalMs: 3000,
    });
    expect(dcaResult.data?.steps[1]?.input).toMatchObject({ waitMs: 3000 });
  });
});
