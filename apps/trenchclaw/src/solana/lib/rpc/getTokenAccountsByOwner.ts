import { address } from "@solana/kit";
import type { Commitment, Slot } from "@solana/kit";

import { createRateLimitedSolanaRpc } from "./client";
import { compactRpcRequestConfig } from "./requestConfig";
import { resolveRequiredRpcUrl } from "./urls";

export type TokenAccountsByOwnerEncoding = "base64" | "jsonParsed";

export interface GetTokenAccountsByOwnerParams {
  rpcUrl?: string;
  ownerAddress: string;
  mintAddress?: string;
  programId?: string;
  encoding?: TokenAccountsByOwnerEncoding;
  commitment?: Commitment;
  minContextSlot?: Slot;
  rpcConfig?: Parameters<typeof createRateLimitedSolanaRpc>[1];
}

export interface GetTokenAccountsByOwnerEntry {
  address: string;
  account: unknown | null;
}

export interface GetTokenAccountsByOwnerResult {
  contextSlot: bigint;
  accounts: GetTokenAccountsByOwnerEntry[];
}

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

export async function getTokenAccountsByOwner(
  params: GetTokenAccountsByOwnerParams,
): Promise<GetTokenAccountsByOwnerResult> {
  const rpc = createRateLimitedSolanaRpc(params.rpcUrl ?? resolveRequiredRpcUrl(), params.rpcConfig);
  const filter = params.mintAddress
    ? { mint: address(params.mintAddress) }
    : params.programId
      ? { programId: address(params.programId) }
      : null;

  if (!filter) {
    throw new Error("Either `mintAddress` or `programId` is required.");
  }
  const requestConfig = compactRpcRequestConfig({
    commitment: params.commitment,
    encoding: params.encoding ?? "jsonParsed",
    minContextSlot: params.minContextSlot,
  });

  const response = await (rpc as any)
    .getTokenAccountsByOwner(address(params.ownerAddress), filter, requestConfig)
    .send();

  const context = isRecord(response) && isRecord(response.context) ? response.context : null;
  const values = isRecord(response) && Array.isArray(response.value) ? response.value : [];

  return {
    contextSlot: toBigInt(context?.slot),
    accounts: values.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.pubkey !== "string") {
        return [];
      }
      return [{
        address: entry.pubkey,
        account: "account" in entry ? entry.account ?? null : null,
      }];
    }),
  };
}
