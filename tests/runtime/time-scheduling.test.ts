import { describe, expect, test } from "bun:test";

import {
  deriveEvenlySpacedIntervalMs,
  resolveGranularDurationMs,
  resolveScheduledTimeUnixMs,
} from "../../apps/trenchclaw/src/automation/triggers/time";
import { computeAnchoredWakeupRunAt } from "../../apps/trenchclaw/src/automation/triggers/wakeup";

describe("runtime time scheduling", () => {
  test("parses seconds for trading and rejects minute-only wakeup violations", () => {
    expect(
      resolveGranularDurationMs({
        duration: "5s",
        granularity: "seconds",
        label: "trading interval",
      }),
    ).toBe(5_000);

    expect(() =>
      resolveGranularDurationMs({
        duration: "30s",
        granularity: "minutes",
        label: "wakeup interval",
      }),
    ).toThrow("whole minutes");
  });

  test("resolves relative trading execution times from shared time utilities", () => {
    const executeAtUnixMs = resolveScheduledTimeUnixMs({
      inDuration: "60s",
      now: 1_700_000_000_123,
      granularity: "seconds",
      label: "execute",
    });

    expect(executeAtUnixMs).toBe(1_700_000_060_123);
  });

  test("derives even DCA intervals on second boundaries", () => {
    expect(
      deriveEvenlySpacedIntervalMs({
        startAtUnixMs: 1_700_000_000_000,
        endAtUnixMs: 1_700_000_006_400,
        installments: 3,
        granularity: "seconds",
        label: "DCA schedule",
      }),
    ).toBe(3_000);
  });

  test("rejects DCA spans that are too short for second granularity", () => {
    expect(() =>
      deriveEvenlySpacedIntervalMs({
        startAtUnixMs: 1_700_000_000_000,
        endAtUnixMs: 1_700_000_001_500,
        installments: 3,
        granularity: "seconds",
        label: "DCA schedule",
      }),
    ).toThrow("too short");
  });

  test("keeps managed wakeup anchored on minute intervals", () => {
    expect(
      computeAnchoredWakeupRunAt({
        anchorUnixMs: 1_700_000_000_000,
        intervalMinutes: 10,
        now: 1_700_000_599_999,
      }),
    ).toBe(1_700_000_600_000);
  });
});
