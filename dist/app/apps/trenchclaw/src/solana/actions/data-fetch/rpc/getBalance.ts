import { address, createSolanaRpc } from "@solana/kit";
import type { Commitment, Slot } from "@solana/kit";
import { DEFAULT_SOLANA_MAINNET_RPC_URL } from "./shared";

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
  const rpc = createSolanaRpc(params.rpcUrl ?? DEFAULT_SOLANA_MAINNET_RPC_URL, params.rpcConfig);
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
