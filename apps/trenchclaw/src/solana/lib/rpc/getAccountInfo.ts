import { address } from "@solana/kit";
import type { Commitment, DataSlice, Slot } from "@solana/kit";
import { createRateLimitedSolanaRpc } from "./client";
import { compactRpcRequestConfig } from "./requestConfig";
import { resolveRequiredRpcUrl } from "./urls";

export type AccountInfoEncoding = "base64" | "jsonParsed";

export interface GetAccountInfoParams {
  rpcUrl?: string;
  account: string;
  encoding?: AccountInfoEncoding;
  commitment?: Commitment;
  minContextSlot?: Slot;
  dataSlice?: DataSlice;
  rpcConfig?: Parameters<typeof createRateLimitedSolanaRpc>[1];
}

export interface GetAccountInfoResult {
  contextSlot: bigint;
  account: unknown | null;
}

export async function getAccountInfo(params: GetAccountInfoParams): Promise<GetAccountInfoResult> {
  const rpc = createRateLimitedSolanaRpc(params.rpcUrl ?? resolveRequiredRpcUrl(), params.rpcConfig);
  const accountAddress = address(params.account);
  const encoding = params.encoding ?? "base64";
  const jsonParsedRequestConfig = compactRpcRequestConfig({
    commitment: params.commitment,
    encoding: "jsonParsed" as const,
    minContextSlot: params.minContextSlot,
  });
  const base64RequestConfig = compactRpcRequestConfig({
    commitment: params.commitment,
    dataSlice: params.dataSlice,
    encoding: "base64" as const,
    minContextSlot: params.minContextSlot,
  });

  const response =
    encoding === "jsonParsed"
      ? await rpc
          .getAccountInfo(accountAddress, jsonParsedRequestConfig)
          .send()
      : await rpc
          .getAccountInfo(accountAddress, base64RequestConfig)
          .send();

  return {
    contextSlot: response.context.slot,
    account: response.value,
  };
}
