import { address, createSolanaRpc } from "@solana/kit";
import type { Commitment, Slot } from "@solana/kit";
import { resolveDefaultSolanaRpcUrl } from "./shared";

export interface GetBalanceParams {
  rpcUrl?: string;
  account: string;
  commitment?: Commitment;
  minContextSlot?: Slot;
  rpcConfig?: Parameters<typeof createSolanaRpc>[1];
}

export interface GetBalanceResult {
  contextSlot: bigint;
  lamports: bigint;
}

export async function getBalance(params: GetBalanceParams): Promise<GetBalanceResult> {
  const rpc = createSolanaRpc(params.rpcUrl ?? resolveDefaultSolanaRpcUrl(), params.rpcConfig);
  const accountAddress = address(params.account);
  const response = await rpc
    .getBalance(accountAddress, {
      commitment: params.commitment,
      minContextSlot: params.minContextSlot,
    })
    .send();

  return {
    contextSlot: response.context.slot,
    lamports: response.value,
  };
}
