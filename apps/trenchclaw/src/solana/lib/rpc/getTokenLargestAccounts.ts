import { address } from "@solana/kit";
import type { Commitment } from "@solana/kit";

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

const toUiAmountString = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

export interface GetTokenLargestAccountsParams {
  rpcUrl?: string;
  mintAddress: string;
  commitment?: Commitment;
  rpcConfig?: Parameters<typeof createRateLimitedSolanaRpc>[1];
}

export interface GetTokenLargestAccountsEntry {
  address: string;
  amountRaw: bigint;
  decimals: number | null;
  uiAmountString: string | null;
}

export interface GetTokenLargestAccountsResult {
  contextSlot: bigint;
  accounts: GetTokenLargestAccountsEntry[];
}

export async function getTokenLargestAccounts(
  params: GetTokenLargestAccountsParams,
): Promise<GetTokenLargestAccountsResult> {
  const rpc = createRateLimitedSolanaRpc(params.rpcUrl ?? resolveRequiredRpcUrl(), params.rpcConfig);
  const response = await (rpc as any)
    .getTokenLargestAccounts(address(params.mintAddress), {
      commitment: params.commitment,
    })
    .send();

  const context = isRecord(response) && isRecord(response.context) ? response.context : null;
  const values = isRecord(response) && Array.isArray(response.value) ? response.value : [];

  return {
    contextSlot: toBigInt(context?.slot),
    accounts: values.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.address !== "string") {
        return [];
      }
      return [{
        address: entry.address,
        amountRaw: toBigInt(entry.amount),
        decimals: typeof entry.decimals === "number" ? entry.decimals : null,
        uiAmountString: toUiAmountString(entry.uiAmountString ?? entry.uiAmount),
      }];
    }),
  };
}
