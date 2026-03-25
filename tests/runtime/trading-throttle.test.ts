import { describe, expect, test } from "bun:test";

import { RuntimeActionThrottle, TokenBucketLane } from "../../apps/trenchclaw/src/automation/policy/trading-throttle";

describe("TokenBucketLane", () => {
  test("enforces min spacing and refill-based waits", async () => {
    let now = 0;
    const waits: number[] = [];
    const lane = new TokenBucketLane(
      {
        enabled: true,
        requestsPerWindow: 2,
        windowMs: 1_000,
        maxBurst: 2,
        minSpacingMs: 200,
      },
      {
        now: () => now,
        sleep: async (ms) => {
          waits.push(ms);
          now += ms;
        },
      },
    );

    await lane.acquire();
    await lane.acquire();
    await lane.acquire();

    expect(waits).toEqual([200, 301]);
    expect(lane.snapshot().tokens).toBeLessThan(0.01);
  });
});

describe("RuntimeActionThrottle", () => {
  test("throttles mapped swap actions and ignores unrelated actions", async () => {
    let now = 0;
    const waits: number[] = [];
    const throttle = new RuntimeActionThrottle(
      {
        enabled: true,
        lanes: {
          swapExecution: {
            enabled: true,
            requestsPerWindow: 1,
            windowMs: 1_000,
            maxBurst: 1,
            minSpacingMs: 0,
          },
          solanaRpc: {
            enabled: false,
            requestsPerWindow: 1,
            windowMs: 1_000,
            maxBurst: 1,
            minSpacingMs: 0,
          },
        },
      },
      {
        now: () => now,
        sleep: async (ms) => {
          waits.push(ms);
          now += ms;
        },
      },
    );

    await throttle.acquire("pingRuntime");
    await throttle.acquire("managedSwap");
    await throttle.acquire("managedSwap");

    expect(waits).toEqual([1_000]);
  });
});
