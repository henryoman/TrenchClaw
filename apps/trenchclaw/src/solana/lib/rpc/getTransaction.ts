import type { Commitment } from "@solana/kit";

import { createRateLimitedSolanaRpc } from "./client";
import { resolveRequiredRpcUrl } from "./urls";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const toBigIntOrNull = (value: unknown): bigint | null => {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return BigInt(value);
  }
  return null;
};

export type TransactionEncoding = "base64" | "jsonParsed";

export interface GetTransactionParams {
  rpcUrl?: string;
  signature: string;
  encoding?: TransactionEncoding;
  commitment?: Commitment;
  maxSupportedTransactionVersion?: number;
  rpcConfig?: Parameters<typeof createRateLimitedSolanaRpc>[1];
}

export interface GetTransactionResult {
  slot: bigint | null;
  blockTime: number | null;
  version: unknown;
  meta: unknown | null;
  transaction: unknown | null;
}

export async function getTransaction(params: GetTransactionParams): Promise<GetTransactionResult> {
  const rpc = createRateLimitedSolanaRpc(params.rpcUrl ?? resolveRequiredRpcUrl(), params.rpcConfig);
  const response = await (rpc as any)
    .getTransaction(params.signature, {
      commitment: params.commitment,
      encoding: params.encoding ?? "jsonParsed",
      maxSupportedTransactionVersion: params.maxSupportedTransactionVersion ?? 0,
    })
    .send();

  const value = isRecord(response) ? response : null;

  return {
    slot: toBigIntOrNull(value?.slot),
    blockTime: typeof value?.blockTime === "number" ? value.blockTime : null,
    version: value?.version,
    meta: "meta" in (value ?? {}) ? value?.meta ?? null : null,
    transaction: "transaction" in (value ?? {}) ? value?.transaction ?? null : null,
  };
}
