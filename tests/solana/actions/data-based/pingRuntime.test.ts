import { describe, expect, test } from "bun:test";

import { pingRuntimeAction } from "../../../../apps/trenchclaw/src/solana/actions/data-fetch/runtime/pingRuntime";

describe("pingRuntimeAction", () => {
  test("echoes message and actor for safe dispatcher/queue verification", async () => {
    const result = await pingRuntimeAction.execute(
      {
        actor: "user",
      },
      {
        message: "queue-check",
      },
    );

    expect(result.ok).toBe(true);
    expect(result.retryable).toBe(false);
    expect(result.data?.message).toBe("queue-check");
    expect(result.data?.actor).toBe("user");
    expect(typeof result.data?.receivedAt).toBe("string");
  });
});
