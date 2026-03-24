import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { ActionDispatcher } from "../../apps/trenchclaw/src/ai/core/dispatcher";
import { ActionRegistry } from "../../apps/trenchclaw/src/ai/core/action-registry";
import { InMemoryRuntimeEventBus } from "../../apps/trenchclaw/src/ai/core/event-bus";
import { PolicyEngine } from "../../apps/trenchclaw/src/ai/core/policy-engine";
import { InMemoryStateStore } from "../../apps/trenchclaw/src/ai/core/state-store";
import { createActionContext } from "../../apps/trenchclaw/src/ai/contracts/types/context";

describe("ActionDispatcher", () => {
  test("dispatchPlan resolves dependsOn by step key and interpolates previous outputs", async () => {
    const registry = new ActionRegistry();
    const stateStore = new InMemoryStateStore();
    const dispatcher = new ActionDispatcher({
      registry,
      policyEngine: new PolicyEngine(),
      stateStore,
      eventBus: new InMemoryRuntimeEventBus(),
    });

    registry.register({
      name: "firstAction",
      category: "data-based",
      inputSchema: z.object({ value: z.string() }),
      execute: async (_ctx, input) => ({
        ok: true,
        retryable: false,
        data: {
          echoed: input.value,
        },
        durationMs: 1,
        timestamp: Date.now(),
        idempotencyKey: crypto.randomUUID(),
      }),
    });

    registry.register({
      name: "secondAction",
      category: "data-based",
      inputSchema: z.object({ inherited: z.string() }),
      execute: async (_ctx, input) => ({
        ok: true,
        retryable: false,
        data: input,
        durationMs: 1,
        timestamp: Date.now(),
        idempotencyKey: crypto.randomUUID(),
      }),
    });

    const result = await dispatcher.dispatchPlan(createActionContext({ actor: "agent", stateStore }), [
      {
        key: "first_step",
        actionName: "firstAction",
        input: { value: "hello" },
      },
      {
        key: "second_step",
        actionName: "secondAction",
        dependsOn: "first_step",
        input: {
          inherited: "${steps.first_step.output.echoed}",
        },
      },
    ]);

    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.ok).toBe(true);
    expect(result.results[1]?.ok).toBe(true);
    expect(result.results[1]?.data).toEqual({ inherited: "hello" });
  });

  test("returns an unsupported_action result when a step targets an unregistered action", async () => {
    const stateStore = new InMemoryStateStore();
    const dispatcher = new ActionDispatcher({
      registry: new ActionRegistry(),
      policyEngine: new PolicyEngine(),
      stateStore,
      eventBus: new InMemoryRuntimeEventBus(),
    });

    const result = await dispatcher.dispatchStep(createActionContext({ actor: "agent", stateStore }), {
      actionName: "removedTriggerAction",
      input: {},
    });

    expect(result.results[0]?.ok).toBe(false);
    expect(result.results[0]?.code).toBe("unsupported_action");
    expect(result.results[0]?.error).toContain("not supported by this runtime");
  });
});
