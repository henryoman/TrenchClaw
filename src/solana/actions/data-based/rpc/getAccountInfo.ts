import { address, createSolanaRpc } from "@solana/kit";
import type { Commitment, DataSlice, Slot } from "@solana/kit";
import { DEFAULT_SOLANA_MAINNET_RPC_URL } from "./shared";

export type AccountInfoEncoding = "base64" | "jsonParsed";

export interface GetAccountInfoParams {
  rpcUrl?: string;
  account: string;
  encoding?: AccountInfoEncoding;
  commitment?: Commitment;
  minContextSlot?: Slot;
  dataSlice?: DataSlice;
  rpcConfig?: Parameters<typeof createSolanaRpc>[1];
}

export interface GetAccountInfoResult {
  contextSlot: bigint;
  account: unknown | null;
}

export async function getAccountInfo(params: GetAccountInfoParams): Promise<GetAccountInfoResult> {
  const rpc = createSolanaRpc(params.rpcUrl ?? DEFAULT_SOLANA_MAINNET_RPC_URL, params.rpcConfig);
  const accountAddress = address(params.account);
  const encoding = params.encoding ?? "base64";

  const response =
    encoding === "jsonParsed"
      ? await rpc
          .getAccountInfo(accountAddress, {
            commitment: params.commitment,
            encoding: "jsonParsed",
            minContextSlot: params.minContextSlot,
          })
          .send()
      : await rpc
          .getAccountInfo(accountAddress, {
            commitment: params.commitment,
            dataSlice: params.dataSlice,
            encoding: "base64",
            minContextSlot: params.minContextSlot,
          })
          .send();

  return {
    contextSlot: response.context.slot,
    account: response.value,
  };
}
