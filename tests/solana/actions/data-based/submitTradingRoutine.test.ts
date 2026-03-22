import { describe, expect, test } from "bun:test";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/runtime/types/context";
import type { JobState } from "../../../../apps/trenchclaw/src/ai/runtime/types/state";
import { submitTradingRoutineAction } from "../../../../apps/trenchclaw/src/solana/actions/data-fetch/runtime/submitTradingRoutine";
import { tradingRoutineSpecSchema } from "../../../../apps/trenchclaw/src/solana/trading/routine-spec";

describe("submitTradingRoutineAction", () => {
  test("queues a provider-agnostic one-off swap as an actionSequence job", async () => {
    const capturedInputs: Array<{
      botId: string;
      routineName: string;
      config?: Record<string, unknown>;
      executeAtUnixMs?: number;
      totalCycles?: number;
    }> = [];

    const result = await submitTradingRoutineAction.execute(
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
        version: 1,
        kind: "swap_once",
        swap: {
          provider: "ultra",
          walletGroup: "core-wallets",
          walletName: "maker-1",
          inputCoin: "SOL",
          outputCoin: "JUP",
          amount: "0.25",
          amountUnit: "ui",
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data?.swapProvider).toBe("ultra");
    expect(result.data?.jobCount).toBe(1);
    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0]).toMatchObject({
      routineName: "actionSequence",
      config: {
        kind: "swap_once",
        swapProvider: "ultra",
        steps: [
          {
            actionName: "managedSwap",
            input: {
              provider: "ultra",
              walletGroup: "core-wallets",
              walletName: "maker-1",
              inputCoin: "SOL",
              outputCoin: "JUP",
              amount: "0.25",
            },
          },
        ],
      },
    });
  });

  test("builds staggered DCA jobs with stable per-slice idempotency keys", async () => {
    const capturedInputs: Array<{
      botId: string;
      routineName: string;
      config?: Record<string, unknown>;
      executeAtUnixMs?: number;
      totalCycles?: number;
    }> = [];
    const startAtUnixMs = Date.now() + 60_000;

    const result = await submitTradingRoutineAction.execute(
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
        version: 1,
        kind: "dca",
        executionMode: "staggered_jobs",
        routineId: "routine-dca-1",
        swap: {
          provider: "ultra",
          wallet: "maker_1",
          inputCoin: "SOL",
          outputCoin: "JUP",
          amount: "0.3",
          amountUnit: "ui",
        },
        schedule: {
          installments: 3,
          startAtUnixMs,
          intervalMs: 5_000,
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data?.executionMode).toBe("staggered_jobs");
    expect(result.data?.jobCount).toBe(3);
    expect(capturedInputs.map((entry) => entry.executeAtUnixMs)).toEqual([
      startAtUnixMs,
      startAtUnixMs + 5_000,
      startAtUnixMs + 10_000,
    ]);
    expect(capturedInputs[0]?.config).toMatchObject({
      executionMode: "staggered_jobs",
      sequenceIndex: 1,
      steps: [
        {
          key: "swap-1",
          idempotencyKey: "routine-dca-1:swap-1",
          actionName: "managedSwap",
          input: {
            provider: "ultra",
            amount: "0.1",
          },
        },
      ],
    });
    expect(capturedInputs[2]?.config).toMatchObject({
      sequenceIndex: 3,
      steps: [
        {
          key: "swap-3",
          idempotencyKey: "routine-dca-1:swap-3",
          input: {
            amount: "0.1",
          },
        },
      ],
    });
  });

  test("splits microscopic DCA amounts without collapsing them away", async () => {
    const capturedInputs: Array<{
      botId: string;
      routineName: string;
      config?: Record<string, unknown>;
      executeAtUnixMs?: number;
      totalCycles?: number;
    }> = [];

    const result = await submitTradingRoutineAction.execute(
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
        version: 1,
        kind: "dca",
        executionMode: "inline_sleep",
        routineId: "micro-dca-1",
        swap: {
          provider: "ultra",
          wallet: "maker_1",
          inputCoin: "SOL",
          outputCoin: "USDC",
          amount: "0.000003",
          amountUnit: "ui",
        },
        schedule: {
          installments: 3,
          startAtUnixMs: Date.now() + 60_000,
          intervalMs: 5_000,
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(capturedInputs).toHaveLength(1);
    expect(result.data?.plannedSteps?.map((step) => step.actionName)).toEqual([
      "managedSwap",
      "sleep",
      "managedSwap",
      "sleep",
      "managedSwap",
    ]);
    expect(result.data?.plannedSteps?.[0]?.input).toMatchObject({
      amount: "0.000001",
      outputCoin: "USDC",
    });
    expect(result.data?.plannedSteps?.[2]?.input).toMatchObject({
      amount: "0.000001",
    });
    expect(result.data?.plannedSteps?.[4]?.input).toMatchObject({
      amount: "0.000001",
    });
  });

  test("builds a future round-trip action sequence with swap back leg", async () => {
    const capturedInputs: Array<{
      botId: string;
      routineName: string;
      config?: Record<string, unknown>;
      executeAtUnixMs?: number;
      totalCycles?: number;
    }> = [];
    const executeAtUnixMs = Date.now() + 60_000;

    const result = await submitTradingRoutineAction.execute(
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
        version: 1,
        kind: "action_sequence",
        executeAtUnixMs,
        routineId: "micro-roundtrip-1",
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

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0]?.executeAtUnixMs).toBe(executeAtUnixMs);
    expect(result.data?.plannedSteps).toEqual([
      expect.objectContaining({
        key: "buy-usdc",
        actionName: "managedSwap",
      }),
      expect.objectContaining({
        key: "wait-a-bit",
        actionName: "sleep",
      }),
      expect.objectContaining({
        key: "sell-back",
        actionName: "managedSwap",
      }),
    ]);
    expect(result.data?.plannedSteps?.[2]?.input).toMatchObject({
      inputCoin: "USDC",
      outputCoin: "SOL",
      amount: "100%",
    });
  });

  test("limits action_sequence custom actions to the hardened allowlist", async () => {
    const parsed = tradingRoutineSpecSchema.safeParse({
      version: 1,
      kind: "action_sequence",
      steps: [
        {
          kind: "action",
          actionName: "manageRuntimeJob",
          input: {},
        },
      ],
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }
    expect(parsed.error.issues[0]?.message).toContain("Invalid option");
  });
});
