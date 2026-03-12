import { describe, expect, test } from "bun:test";

import { actionSequenceRoutine } from "../../../apps/trenchclaw/src/solana/routines/action-sequence";
import { createActionContext } from "../../../apps/trenchclaw/src/ai/runtime/types/context";

describe("actionSequenceRoutine", () => {
  test("returns canonical key-based action steps", async () => {
    const steps = await actionSequenceRoutine(
      createActionContext({ actor: "agent" }),
      {
        id: "job-1",
        botId: "bot-1",
        routineName: "actionSequence",
        status: "pending",
        config: {
          steps: [
            {
              key: "load_memory",
              actionName: "queryInstanceMemory",
              input: {
                request: {
                  type: "getBundle",
                  instanceId: "01",
                },
              },
            },
            {
              key: "read_runtime",
              actionName: "queryRuntimeStore",
              dependsOn: "load_memory",
              input: {
                request: {
                  type: "getRuntimeKnowledgeSurface",
                },
              },
            },
          ],
        },
        cyclesCompleted: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    );

    expect(steps).toHaveLength(2);
    expect(steps[0]?.key).toBe("load_memory");
    expect(steps[0]?.idempotencyKey).toBe("job-1:load_memory");
    expect(steps[1]?.key).toBe("read_runtime");
    expect(steps[1]?.dependsOn).toBe("load_memory");
    expect(steps[1]?.idempotencyKey).toBe("job-1:read_runtime");
  });
});
