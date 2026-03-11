import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";

const sleepInputSchema = z.object({
  waitMs: z.number().int().nonnegative().max(3_600_000),
});

interface SleepOutput {
  waitMs: number;
  status: "slept";
}

export const sleepAction: Action<z.infer<typeof sleepInputSchema>, SleepOutput> = {
  name: "sleep",
  category: "data-based",
  inputSchema: sleepInputSchema,
  async execute(_ctx, input) {
    const startedAt = Date.now();
    await Bun.sleep(input.waitMs);

    return {
      ok: true,
      retryable: false,
      data: {
        waitMs: input.waitMs,
        status: "slept",
      },
      durationMs: Date.now() - startedAt,
      timestamp: Date.now(),
      idempotencyKey: crypto.randomUUID(),
    };
  },
};
