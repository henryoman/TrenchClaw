import { describe, expect, test } from "bun:test";

import { InMemoryStateStore } from "../../../../apps/trenchclaw/src/ai/core/state-store";
import { createActionContext } from "../../../../apps/trenchclaw/src/ai/contracts/types/context";
import { mutateInstanceMemoryAction } from "../../../../apps/trenchclaw/src/tools/core/mutateInstanceMemory";
import { queryInstanceMemoryAction } from "../../../../apps/trenchclaw/src/tools/core/queryInstanceMemory";

describe("instance memory actions", () => {
  test("updates profile and returns bundled memory with normalized fact keys", async () => {
    const stateStore = new InMemoryStateStore();
    const ctx = createActionContext({ actor: "agent", stateStore });

    const profileResult = await mutateInstanceMemoryAction.execute(ctx, {
      request: {
        type: "updateProfile",
        instanceId: "01",
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
        instanceId: "01",
        key: "facts.trading.timeframe",
        value: "intraday",
        confidence: 0.95,
        source: "test",
      },
    });

    expect(factResult.ok).toBe(true);
    const storedFact = stateStore.getInstanceFact({
      instanceId: "01",
      factKey: "facts/trading/timeframe",
    });
    expect(storedFact?.factValue).toBe("intraday");

    const bundleResult = await queryInstanceMemoryAction.execute(ctx, {
      request: {
        type: "getBundle",
        instanceId: "01",
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
    expect(payload.instanceId).toBe("01");
    expect(payload.result.profile?.displayName).toBe("Scalper One");
    expect(payload.result.profile?.tradingStyle).toBe("scalper");
    expect(payload.result.facts[0]?.factKey).toBe("facts/trading/timeframe");
    expect(payload.result.factMap["facts/trading/timeframe"]).toBe("intraday");
  });

});
