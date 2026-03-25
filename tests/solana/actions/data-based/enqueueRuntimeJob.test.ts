import { describe, expect, test } from "bun:test";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/contracts/types/context";
import type { JobState } from "../../../../apps/trenchclaw/src/ai/contracts/types/state";
import { enqueueRuntimeJobAction } from "../../../../apps/trenchclaw/src/tools/core/enqueueRuntimeJob";

describe("enqueueRuntimeJobAction", () => {
  test("enqueues immediate work as ready when no future timestamp is provided", async () => {
    let capturedInput:
      | {
          botId: string;
          routineName: string;
          config?: Record<string, unknown>;
          totalCycles?: number;
          executeAtUnixMs?: number;
        }
      | undefined;
    const now = Date.now();

    const result = await enqueueRuntimeJobAction.execute(
      createActionContext({
        actor: "agent",
        enqueueJob: async (input) => {
          capturedInput = input;
          const job: JobState = {
            id: "job-immediate-1",
            botId: input.botId,
            routineName: input.routineName,
            status: "pending",
            config: input.config ?? {},
            cyclesCompleted: 0,
            totalCycles: input.totalCycles,
            createdAt: now,
            updatedAt: now,
            nextRunAt: now,
          };
          return job;
        },
      }),
      {
        botId: "bot-immediate",
        routineName: "actionSequence",
        config: {
          steps: [
            {
              actionName: "pingRuntime",
              input: {
                message: "run now",
              },
            },
          ],
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(capturedInput?.executeAtUnixMs).toBeUndefined();
    expect(result.data?.mode).toBe("ready");
    expect(result.data?.job.id).toBe("job-immediate-1");
  });

  test("enqueues future work as scheduled and preserves executeAtUnixMs", async () => {
    let capturedExecuteAtUnixMs: number | undefined;
    const executeAtUnixMs = Date.now() + 60_000;

    const result = await enqueueRuntimeJobAction.execute(
      createActionContext({
        actor: "agent",
        enqueueJob: async (input) => {
          capturedExecuteAtUnixMs = input.executeAtUnixMs;
          const job: JobState = {
            id: "job-scheduled-1",
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
        botId: "bot-scheduled",
        routineName: "actionSequence",
        executeAtUnixMs,
        config: {
          steps: [
            {
              actionName: "pingRuntime",
              input: {
                message: "run later",
              },
            },
          ],
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(capturedExecuteAtUnixMs).toBe(executeAtUnixMs);
    expect(result.data?.mode).toBe("scheduled");
    expect(result.data?.scheduledForUnixMs).toBe(executeAtUnixMs);
    expect((result.data?.delayMs ?? 0) > 0).toBe(true);
  });

  test("fails clearly when enqueueJob is missing from action context", async () => {
    const result = await enqueueRuntimeJobAction.execute(
      createActionContext({
        actor: "agent",
      }),
      {
        botId: "bot-missing",
        routineName: "actionSequence",
        config: {},
      },
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe("QUEUE_UNAVAILABLE");
  });
});
