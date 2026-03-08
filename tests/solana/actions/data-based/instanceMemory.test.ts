import { describe, expect, test } from "bun:test";

import { InMemoryStateStore } from "../../../../apps/trenchclaw/src/ai/core/state-store";
import { createActionContext } from "../../../../apps/trenchclaw/src/ai/runtime/types/context";
import { mutateInstanceMemoryAction } from "../../../../apps/trenchclaw/src/solana/actions/data-fetch/runtime/mutateInstanceMemory";
import { queryInstanceMemoryAction } from "../../../../apps/trenchclaw/src/solana/actions/data-fetch/runtime/queryInstanceMemory";

describe("instance memory actions", () => {
  test("updates profile and returns bundled memory with normalized fact keys", async () => {
    const stateStore = new InMemoryStateStore();
    const ctx = createActionContext({ actor: "agent", stateStore });

    const profileResult = await mutateInstanceMemoryAction.execute(ctx, {
      request: {
        type: "updateProfile",
        instanceId: "instance-1",
        patch: {
          displayName: "Scalper One",
          tradingStyle: "scalper",
          riskTolerance: "high",
          preferredAssets: ["SOL", "JUP"],
        },
      },
    });

    expect(profileResult.ok).toBe(true);

    const factResult = await mutateInstanceMemoryAction.execute(ctx, {
      request: {
        type: "upsertFact",
        instanceId: "instance-1",
        key: "facts.trading.timeframe",
        value: "intraday",
        confidence: 0.95,
        source: "test",
      },
    });

    expect(factResult.ok).toBe(true);
    const storedFact = stateStore.getInstanceFact({
      instanceId: "instance-1",
      factKey: "facts/trading/timeframe",
    });
    expect(storedFact?.factValue).toBe("intraday");

    const bundleResult = await queryInstanceMemoryAction.execute(ctx, {
      request: {
        type: "getBundle",
        instanceId: "instance-1",
        includeExpired: false,
        limit: 20,
      },
    });

    expect(bundleResult.ok).toBe(true);
    const payload = bundleResult.data as {
      requestType: string;
      instanceId: string;
      result: {
        instanceId: string;
        profile: {
          displayName?: string;
          tradingStyle?: string;
        } | null;
        facts: Array<{ factKey: string; factValue: unknown }>;
        factMap: Record<string, unknown>;
      };
    };
    expect(payload.requestType).toBe("getBundle");
    expect(payload.instanceId).toBe("instance-1");
    expect(payload.result.profile?.displayName).toBe("Scalper One");
    expect(payload.result.profile?.tradingStyle).toBe("scalper");
    expect(payload.result.facts[0]?.factKey).toBe("facts/trading/timeframe");
    expect(payload.result.factMap["facts/trading/timeframe"]).toBe("intraday");
  });

  test("uses active instance id fallback for profile reads and writes", async () => {
    const previous = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = "instance-env";

    try {
      const stateStore = new InMemoryStateStore();
      const ctx = createActionContext({ actor: "agent", stateStore });

      const updateResult = await mutateInstanceMemoryAction.execute(ctx, {
        request: {
          type: "updateProfile",
          patch: {
            summary: "Trades fast and likes momentum names",
          },
        },
      });

      expect(updateResult.ok).toBe(true);

      const readResult = await queryInstanceMemoryAction.execute(ctx, {
        request: {
          type: "getProfile",
        },
      });

      expect(readResult.ok).toBe(true);
      const payload = readResult.data as {
        requestType: string;
        instanceId: string;
        result: {
          summary?: string;
        } | null;
      };
      expect(payload.requestType).toBe("getProfile");
      expect(payload.instanceId).toBe("instance-env");
      expect(payload.result?.summary).toBe("Trades fast and likes momentum names");
    } finally {
      if (previous === undefined) {
        delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
      } else {
        process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = previous;
      }
    }
  });
});
