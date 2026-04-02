import { address } from "@solana/kit";
import type { Commitment, Slot } from "@solana/kit";

import { createRateLimitedSolanaRpc } from "./client";
import { compactRpcRequestConfig } from "./requestConfig";
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

export interface GetTokenSupplyParams {
  rpcUrl?: string;
  mintAddress: string;
  commitment?: Commitment;
  minContextSlot?: Slot;
  rpcConfig?: Parameters<typeof createRateLimitedSolanaRpc>[1];
}

export interface GetTokenSupplyResult {
  contextSlot: bigint;
  amountRaw: bigint;
  decimals: number;
  uiAmountString: string | null;
}

export async function getTokenSupply(params: GetTokenSupplyParams): Promise<GetTokenSupplyResult> {
  const rpc = createRateLimitedSolanaRpc(params.rpcUrl ?? resolveRequiredRpcUrl(), params.rpcConfig);
  const requestConfig = compactRpcRequestConfig({
    commitment: params.commitment,
    minContextSlot: params.minContextSlot,
  });
  const response = await (rpc as any)
    .getTokenSupply(address(params.mintAddress), requestConfig)
    .send();

  const context = isRecord(response) && isRecord(response.context) ? response.context : null;
  const value = isRecord(response) && isRecord(response.value) ? response.value : null;

  return {
    contextSlot: toBigInt(context?.slot),
    amountRaw: toBigInt(value?.amount),
    decimals: typeof value?.decimals === "number" ? value.decimals : 0,
    uiAmountString: toUiAmountString(value?.uiAmountString ?? value?.uiAmount),
  };
}
