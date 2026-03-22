import { describe, expect, test } from "bun:test";

import { buildScheduleDisplayRows } from "../../apps/frontends/gui/src/components/workspace/schedule-display";

describe("buildScheduleDisplayRows", () => {
  test("expands managed wakeups into the next ten upcoming rows", () => {
    const rows = buildScheduleDisplayRows({
      wakeupSettings: {
        intervalMinutes: 1,
        prompt: "noop",
      },
      jobs: [
        {
          id: "wakeup-job",
          serialNumber: 12,
          botId: "runtime:wakeup:01",
          routineName: "runtimeWakeup",
          status: "upcoming",
          createdAt: 1,
          updatedAt: 2,
          nextRunAt: 300_000,
        },
        {
          id: "trade-job",
          serialNumber: 13,
          botId: "bot-1",
          routineName: "managedUltraSwap",
          status: "upcoming",
          createdAt: 1,
          updatedAt: 2,
          nextRunAt: 330_000,
        },
      ],
    });

    expect(rows).toHaveLength(11);
    expect(rows[0]).toMatchObject({
      routineName: "Wakeup",
      nextRunAt: 300_000,
      status: "upcoming",
      botId: "",
    });
    expect(rows[1]).toMatchObject({
      routineName: "managedUltraSwap",
      nextRunAt: 330_000,
      status: "upcoming",
    });
    expect(rows[2]).toMatchObject({
      routineName: "Wakeup",
      nextRunAt: 360_000,
      botId: "",
    });
    expect(rows.at(-1)).toMatchObject({
      routineName: "Wakeup",
      nextRunAt: 840_000,
      botId: "",
    });
  });

  test("keeps paused rows and does not expand wakeups without an interval setting", () => {
    const rows = buildScheduleDisplayRows({
      wakeupSettings: {
        intervalMinutes: 0,
        prompt: "",
      },
      jobs: [
        {
          id: "wakeup-job",
          serialNumber: 1,
          botId: "runtime:wakeup:01",
          routineName: "runtimeWakeup",
          status: "upcoming",
          createdAt: 1,
          updatedAt: 2,
          nextRunAt: 300_000,
        },
        {
          id: "paused-job",
          serialNumber: 2,
          botId: "bot-paused",
          routineName: "actionSequence",
          status: "paused",
          createdAt: 1,
          updatedAt: 2,
          nextRunAt: null,
        },
      ],
    });

    expect(rows).toEqual([
      {
        id: "wakeup-job",
        status: "upcoming",
        routineName: "runtimeWakeup",
        botId: "runtime:wakeup:01",
        nextRunAt: 300_000,
      },
      {
        id: "paused-job",
        status: "paused",
        routineName: "actionSequence",
        botId: "bot-paused",
        nextRunAt: null,
      },
    ]);
  });
});
