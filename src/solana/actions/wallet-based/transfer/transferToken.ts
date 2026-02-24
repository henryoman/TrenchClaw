import { z } from "zod";

import type { Action } from "../../../../ai/contracts/action";

const transferTokenInputSchema = z.object({
  mintAddress: z.string().min(1),
  destination: z.string().min(1),
  amountUi: z.number().positive(),
});

export type TransferTokenInput = z.output<typeof transferTokenInputSchema>;

export interface TransferTokenOutput {
  mintAddress: string;
  destination: string;
  amountUi: number;
}

export const transferTokenAction: Action<TransferTokenInput, TransferTokenOutput> = {
  name: "transferToken",
  category: "wallet-based",
  subcategory: "transfer",
  inputSchema: transferTokenInputSchema,
  async execute(_ctx, input) {
    return {
      ok: false,
      retryable: false,
      code: "NOT_IMPLEMENTED",
      error: `transferToken is not implemented yet (mint=${input.mintAddress}, destination=${input.destination}, amountUi=${input.amountUi})`,
      durationMs: 0,
      timestamp: Date.now(),
      idempotencyKey: crypto.randomUUID(),
    };
  },
};
