import { z } from "zod";

const HELIUS_ENHANCED_BASE_URL = "https://api-mainnet.helius-rpc.com/v0";
const enhancedTransactionsSchema = z.array(z.object({
  signature: z.string().min(1),
}).passthrough());

export interface HeliusEnhancedHistoryRequest {
  apiKey: string;
  address: string;
  limit: number;
  sortOrder?: "asc" | "desc";
  type?: "SWAP";
  beforeSignature?: string;
  signal?: AbortSignal;
}

// The Enhanced Transactions REST contract supplies parsed swap events used by
// history and trigger pricing. It does not require Helius SDK's Solana peers.
export const getHeliusEnhancedTransactionsByAddress = async (
  input: HeliusEnhancedHistoryRequest,
): Promise<Array<z.infer<typeof enhancedTransactionsSchema>[number]>> => {
  const apiKey = z.string().trim().min(1).parse(input.apiKey);
  const address = z.string().trim().min(32).max(44).regex(/^[1-9A-HJ-NP-Za-km-z]+$/).parse(input.address);
  const limit = z.number().int().min(1).max(100).parse(input.limit);
  const url = new URL(`${HELIUS_ENHANCED_BASE_URL}/addresses/${address}/transactions`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort-order", input.sortOrder ?? "desc");
  if (input.type) {
    url.searchParams.set("type", input.type);
  }
  if (input.beforeSignature) {
    url.searchParams.set("before-signature", input.beforeSignature);
  }

  const timeout = AbortSignal.timeout(15_000);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: input.signal ? AbortSignal.any([input.signal, timeout]) : timeout,
    });
  } catch {
    // Fetch errors can contain the authenticated URL. Keep credentials out of
    // action results and preserve status/message errors for caller retry logic.
    throw new Error(input.signal?.aborted
      ? "Helius enhanced history request was aborted."
      : "Helius enhanced history request failed or timed out.");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorPayload = z.object({
      message: z.string().optional(),
      error: z.union([z.string(), z.object({ message: z.string().optional() })]).optional(),
    }).safeParse(payload);
    const details = errorPayload.success ? errorPayload.data : undefined;
    const message = (typeof details?.error === "string" ? details.error : details?.error?.message)
      ?? details?.message ?? response.statusText;
    throw new Error(`Helius HTTP ${response.status}: ${message.split(apiKey).join("[redacted]")}`);
  }
  const transactions = enhancedTransactionsSchema.safeParse(payload);
  if (!transactions.success) {
    throw new Error("Helius enhanced history returned an invalid transaction array.");
  }
  return transactions.data;
};
