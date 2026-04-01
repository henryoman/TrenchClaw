import { address } from "@solana/kit";
import type { Commitment, Slot } from "@solana/kit";

import { createRateLimitedSolanaRpc } from "./client";
import { resolveRequiredRpcUrl } from "./urls";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const toBigInt = (value: unknown): bigint => {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return BigInt(value);
  }
  return 0n;
};

export interface GetSignaturesForAddressParams {
  rpcUrl?: string;
  account: string;
  before?: string;
  until?: string;
  limit?: number;
  commitment?: Commitment;
  minContextSlot?: Slot;
  rpcConfig?: Parameters<typeof createRateLimitedSolanaRpc>[1];
}

export interface RpcSignatureEntry {
  signature: string;
  slot: bigint;
  error: unknown | null;
  memo: string | null;
  blockTime: number | null;
  confirmationStatus: string | null;
}

export interface GetSignaturesForAddressResult {
  signatures: RpcSignatureEntry[];
}

export async function getSignaturesForAddress(
  params: GetSignaturesForAddressParams,
): Promise<GetSignaturesForAddressResult> {
  const rpc = createRateLimitedSolanaRpc(params.rpcUrl ?? resolveRequiredRpcUrl(), params.rpcConfig);
  const response = await (rpc as any)
    .getSignaturesForAddress(address(params.account), {
      before: params.before,
      until: params.until,
      limit: params.limit,
      commitment: params.commitment,
      minContextSlot: params.minContextSlot,
    })
    .send();

  const values = Array.isArray(response) ? response : [];

  return {
    signatures: values.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.signature !== "string") {
        return [];
      }
      return [{
        signature: entry.signature,
        slot: toBigInt(entry.slot),
        error: "err" in entry ? entry.err ?? null : null,
        memo: typeof entry.memo === "string" ? entry.memo : null,
        blockTime: typeof entry.blockTime === "number" ? entry.blockTime : null,
        confirmationStatus: typeof entry.confirmationStatus === "string" ? entry.confirmationStatus : null,
      }];
    }),
  };
}
