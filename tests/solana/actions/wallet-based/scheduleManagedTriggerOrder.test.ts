import { describe, expect, test } from "bun:test";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/runtime/types/context";
import type { JobState } from "../../../../apps/trenchclaw/src/ai/runtime/types/state";
import { scheduleManagedTriggerOrderAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/swap/trigger/scheduleManagedOrder";

describe("scheduleManagedTriggerOrderAction", () => {
  test("queues a single future managed trigger order", async () => {
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

    const result = await scheduleManagedTriggerOrderAction.execute(
      createActionContext({
        actor: "agent",
        enqueueJob: async (input) => {
          capturedInput = input;
          const job: JobState = {
            id: "job-trigger-once-1",
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
        walletGroup: "core-wallets",
        walletName: "maker_1",
        inputCoin: "SOL",
        outputCoin: "USDC",
        makingAmount: "0.15",
        makingAmountUnit: "ui",
        limitPrice: "210",
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
      key: "trigger-1",
      actionName: "managedTriggerOrder",
      input: {
        walletGroup: "core-wallets",
        walletName: "maker_1",
        inputCoin: "SOL",
        outputCoin: "USDC",
        makingAmount: "0.15",
        limitPrice: "210",
      },
    });
  });

  test("builds an equal-interval trigger-order DCA sequence and splits both sides of a fixed-ratio order", async () => {
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

    const result = await scheduleManagedTriggerOrderAction.execute(
      createActionContext({
        actor: "agent",
        enqueueJob: async (input) => {
          capturedInput = input;
          const job: JobState = {
            id: "job-trigger-dca-1",
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
        walletGroup: "core-wallets",
        walletName: "maker_1",
        inputCoin: "SOL",
        outputCoin: "USDC",
        makingAmount: "0.3",
        makingAmountUnit: "ui",
        takingAmount: "63",
        takingAmountUnit: "ui",
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
      "managedTriggerOrder",
      "sleep",
      "managedTriggerOrder",
      "sleep",
      "managedTriggerOrder",
    ]);
    expect(result.data?.steps[0]?.input).toMatchObject({ makingAmount: "0.1", takingAmount: "21" });
    expect(result.data?.steps[1]?.input).toMatchObject({ waitMs: 3000 });
    expect(result.data?.steps[2]?.input).toMatchObject({ makingAmount: "0.1", takingAmount: "21" });
    expect(result.data?.steps[3]?.input).toMatchObject({ waitMs: 3000 });
    expect(result.data?.steps[4]?.input).toMatchObject({ makingAmount: "0.1", takingAmount: "21" });
  });
});
