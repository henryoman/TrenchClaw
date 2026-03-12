import { describe, expect, test } from "bun:test";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/runtime/types/context";
import { InMemoryStateStore } from "../../../../apps/trenchclaw/src/ai/core/state-store";
import { upsertInstanceFactAction } from "../../../../apps/trenchclaw/src/solana/actions/data-fetch/runtime/upsertInstanceFact";

describe("upsertInstanceFactAction", () => {
  test("upserts instance facts into state store", async () => {
    const stateStore = new InMemoryStateStore();
    const result = await upsertInstanceFactAction.execute(
      createActionContext({ actor: "agent", stateStore }),
      {
        instanceId: "01",
        factKey: "preferred-dex",
        factValue: { name: "jupiter" },
        confidence: 0.9,
        source: "chat",
      },
    );

    expect(result.ok).toBe(true);
    const fact = stateStore.getInstanceFact({
      instanceId: "01",
      factKey: "preferred-dex",
    });
    expect(fact).not.toBeNull();
    expect(fact?.source).toBe("chat");
    expect(fact?.factValue).toEqual({ name: "jupiter" });
  });

  test("uses active instance id from env when input instanceId is omitted", async () => {
    const previous = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = "11";
    try {
      const stateStore = new InMemoryStateStore();
      const result = await upsertInstanceFactAction.execute(
        createActionContext({ actor: "agent", stateStore }),
        {
          factKey: "risk-profile",
          factValue: "aggressive",
          confidence: 0.7,
          source: "test",
        },
      );

      expect(result.ok).toBe(true);
      const fact = stateStore.getInstanceFact({
        instanceId: "11",
        factKey: "risk-profile",
      });
      expect(fact?.factValue).toBe("aggressive");
    } finally {
      if (previous === undefined) {
        delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
      } else {
        process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = previous;
      }
    }
  });
});

