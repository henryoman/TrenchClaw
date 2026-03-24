import { describe, expect, test } from "bun:test";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/contracts/types/context";
import type { JobState } from "../../../../apps/trenchclaw/src/ai/contracts/types/state";
import { manageRuntimeJobAction } from "../../../../apps/trenchclaw/src/solana/actions/data-fetch/runtime/manageRuntimeJob";

describe("manageRuntimeJobAction", () => {
  test("pauses a queued job through the runtime job manager", async () => {
    let capturedInput: { jobId: string; operation: "pause" | "cancel" | "resume" } | undefined;

    const result = await manageRuntimeJobAction.execute(
      createActionContext({
        actor: "agent",
        manageJob: async (input) => {
          capturedInput = input;
          const job: JobState = {
            id: input.jobId,
            botId: "bot-pause",
            routineName: "actionSequence",
            status: "paused",
            config: {},
            cyclesCompleted: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            nextRunAt: Date.now() + 60_000,
          };
          return job;
        },
      }),
      {
        jobId: "job-pause-1",
        operation: "pause",
      },
    );

    expect(result.ok).toBe(true);
    expect(capturedInput).toEqual({
      jobId: "job-pause-1",
      operation: "pause",
    });
    expect(result.data?.job.status).toBe("paused");
  });

  test("resolves a job by serial number before resuming it", async () => {
    const result = await manageRuntimeJobAction.execute(
      createActionContext({
        actor: "agent",
        stateStore: {
          getJobBySerialNumber: (serialNumber: number) =>
            serialNumber === 42
              ? ({
                  id: "job-resume-42",
                  serialNumber,
                  botId: "bot-resume",
                  routineName: "actionSequence",
                  status: "paused",
                  config: {},
                  cyclesCompleted: 0,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                } as JobState)
              : null,
        } as never,
        manageJob: async (input) => ({
          id: input.jobId,
          serialNumber: 42,
          botId: "bot-resume",
          routineName: "actionSequence",
          status: "pending",
          config: {},
          cyclesCompleted: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          nextRunAt: Date.now() + 1_000,
        }),
      }),
      {
        jobSerial: 42,
        operation: "resume",
      },
    );

    expect(result.ok).toBe(true);
    expect(result.data?.operation).toBe("resume");
    expect(result.data?.job.id).toBe("job-resume-42");
    expect(result.data?.job.serialNumber).toBe(42);
  });

  test("cancels a queued job through the runtime job manager", async () => {
    const result = await manageRuntimeJobAction.execute(
      createActionContext({
        actor: "agent",
        manageJob: async (input) => ({
          id: input.jobId,
          botId: "bot-cancel",
          routineName: "actionSequence",
          status: "stopped",
          config: {},
          cyclesCompleted: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      }),
      {
        jobId: "job-cancel-1",
        operation: "cancel",
      },
    );

    expect(result.ok).toBe(true);
    expect(result.data?.operation).toBe("cancel");
    expect(result.data?.job.status).toBe("stopped");
  });

  test("fails clearly when manageJob is missing from action context", async () => {
    const result = await manageRuntimeJobAction.execute(
      createActionContext({
        actor: "agent",
      }),
      {
        jobSerial: 99,
        operation: "pause",
      },
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe("JOB_CONTROL_UNAVAILABLE");
  });
});
