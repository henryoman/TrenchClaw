import { z } from "zod";

import type { Action } from "../../../../ai/contracts/types/action";

const pingRuntimeInputSchema = z.object({
  message: z.string().trim().min(1).max(200).default("ping"),
});

type PingRuntimeInput = z.output<typeof pingRuntimeInputSchema>;

interface PingRuntimeOutput {
  message: string;
  actor: string;
  receivedAt: string;
}

export const pingRuntimeAction: Action<PingRuntimeInput, PingRuntimeOutput> = {
  name: "pingRuntime",
  category: "data-based",
  subcategory: "read-only",
  inputSchema: pingRuntimeInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    return {
      ok: true,
      retryable: false,
      data: {
        message: input.message,
        actor: ctx.actor ?? "system",
        receivedAt: new Date().toISOString(),
      },
      durationMs: Date.now() - startedAt,
      timestamp: Date.now(),
      idempotencyKey: crypto.randomUUID(),
    };
  },
};
