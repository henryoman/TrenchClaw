import { z } from "zod";

import type { Action } from "../../../../ai/contracts/action";

const transferSolInputSchema = z.object({
  destination: z.string().min(1),
  amountSol: z.number().positive(),
});

export type TransferSolInput = z.output<typeof transferSolInputSchema>;

export interface TransferSolOutput {
  destination: string;
  amountSol: number;
}

export const transferSolAction: Action<TransferSolInput, TransferSolOutput> = {
  name: "transferSol",
  category: "wallet-based",
  subcategory: "transfer",
  inputSchema: transferSolInputSchema,
  async execute(_ctx, input) {
    return {
      ok: false,
      retryable: false,
      code: "NOT_IMPLEMENTED",
      error: `transferSol is not implemented yet (destination=${input.destination}, amountSol=${input.amountSol})`,
      durationMs: 0,
      timestamp: Date.now(),
      idempotencyKey: crypto.randomUUID(),
    };
  },
};
