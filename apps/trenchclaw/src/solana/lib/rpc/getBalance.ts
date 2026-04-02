import { address } from "@solana/kit";
import type { Commitment, Slot } from "@solana/kit";
import { createRateLimitedSolanaRpc } from "./client";
import { compactRpcRequestConfig } from "./requestConfig";
import { resolveRequiredRpcUrl } from "./urls";

export interface GetBalanceParams {
  rpcUrl?: string;
  account: string;
  commitment?: Commitment;
  minContextSlot?: Slot;
  rpcConfig?: Parameters<typeof createRateLimitedSolanaRpc>[1];
}

export interface GetBalanceResult {
  contextSlot: bigint;
  lamports: bigint;
}

export async function getBalance(params: GetBalanceParams): Promise<GetBalanceResult> {
  const rpc = createRateLimitedSolanaRpc(params.rpcUrl ?? resolveRequiredRpcUrl(), params.rpcConfig);
  const accountAddress = address(params.account);
  const requestConfig = compactRpcRequestConfig({
    commitment: params.commitment,
    minContextSlot: params.minContextSlot,
  });
  const response = await rpc
    .getBalance(accountAddress, requestConfig)
    .send();

  return {
    contextSlot: response.context.slot,
    lamports: response.value,
  };
}
