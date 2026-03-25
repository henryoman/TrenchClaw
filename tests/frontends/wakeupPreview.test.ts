import { describe, expect, test } from "bun:test";

import {
  buildWakeupSchedulePreview,
  WAKEUP_PREVIEW_ROUNDS,
} from "../../apps/frontends/gui/src/components/workspace/wakeupPreview";

describe("buildWakeupSchedulePreview", () => {
  test("merges projected wakeups with future scheduled jobs in chronological order", () => {
    const now = Date.UTC(2026, 2, 22, 18, 0, 0);
    const preview = buildWakeupSchedulePreview({
      now,
      wakeupSettings: {
        intervalMinutes: 15,
        prompt: "noop",
      },
      jobs: [
        {
          id: "trade-1",
          serialNumber: 7,
          botId: "bot-trader",
          routineName: "managedUltraSwap",
          status: "upcoming",
          createdAt: now - 5_000,
          updatedAt: now - 4_000,
          nextRunAt: now + 2 * 60_000,
        },
        {
          id: "wakeup-job",
          serialNumber: 8,
          botId: "runtime:wakeup:01",
          routineName: "runtimeWakeup",
          status: "upcoming",
          createdAt: now - 5_000,
          updatedAt: now - 4_000,
          nextRunAt: now + 5 * 60_000,
        },
        {
          id: "trade-2",
          serialNumber: 9,
          botId: "bot-dca",
          routineName: "dcaRoutine",
          status: "upcoming",
          createdAt: now - 5_000,
          updatedAt: now - 4_000,
          nextRunAt: now + 8 * 60_000,
        },
      ],
    });

    expect(preview).toHaveLength(WAKEUP_PREVIEW_ROUNDS + 2);
    expect(preview[0]).toMatchObject({
      kind: "scheduled-job",
      at: now + 2 * 60_000,
      title: "managedUltraSwap",
      status: "upcoming",
    });
    expect(preview[1]).toMatchObject({
      kind: "wakeup",
      at: now + 5 * 60_000,
      title: "Wakeup",
      subtitle: "",
    });
    expect(preview[2]).toMatchObject({
      kind: "scheduled-job",
      at: now + 8 * 60_000,
      title: "dcaRoutine",
      status: "upcoming",
    });
    expect(preview[3]).toMatchObject({
      kind: "wakeup",
      at: now + 20 * 60_000,
      title: "Wakeup",
      subtitle: "",
    });

    const timestamps = preview.map((entry) => entry.at);
    expect(timestamps).toEqual([...timestamps].toSorted((left, right) => left - right));
  });

  test("filters paused and past jobs while tolerating missing managed wakeups", () => {
    const now = Date.UTC(2026, 2, 22, 18, 0, 0);
    const preview = buildWakeupSchedulePreview({
      now,
      wakeupSettings: {
        intervalMinutes: 0,
        prompt: "",
      },
      jobs: [
        {
          id: "past-trade",
          serialNumber: 3,
          botId: "bot-old",
          routineName: "oldTrade",
          status: "upcoming",
          createdAt: now - 10_000,
          updatedAt: now - 9_000,
          nextRunAt: now - 1_000,
        },
        {
          id: "paused-trade",
          serialNumber: 4,
          botId: "bot-paused",
          routineName: "pausedTrade",
          status: "paused",
          createdAt: now - 10_000,
          updatedAt: now - 9_000,
          nextRunAt: null,
        },
        {
          id: "future-trade",
          serialNumber: 5,
          botId: "bot-future",
          routineName: "futureTrade",
          status: "upcoming",
          createdAt: now - 10_000,
          updatedAt: now - 9_000,
          nextRunAt: now + 30_000,
        },
      ],
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      kind: "scheduled-job",
      title: "futureTrade",
      at: now + 30_000,
      status: "upcoming",
    });
  });
});
