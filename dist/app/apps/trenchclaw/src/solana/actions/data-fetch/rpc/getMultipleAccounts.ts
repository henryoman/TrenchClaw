import { address, createSolanaRpc } from "@solana/kit";
import type { Commitment, DataSlice, Slot } from "@solana/kit";
import { resolveDefaultSolanaRpcUrl } from "./shared";

const MAX_GET_MULTIPLE_ACCOUNTS_BATCH_SIZE = 100;

export type MultipleAccountsEncoding = "base64" | "jsonParsed";

export interface GetMultipleAccountsParams {
  rpcUrl?: string;
  accounts: string[];
  encoding?: MultipleAccountsEncoding;
  commitment?: Commitment;
  minContextSlot?: Slot;
  dataSlice?: DataSlice;
  rpcConfig?: Parameters<typeof createSolanaRpc>[1];
  chunkSize?: number;
}

export interface GetMultipleAccountsItem {
  address: string;
  account: unknown | null;
}

export interface GetMultipleAccountsResult {
  contextSlot: bigint;
  accounts: GetMultipleAccountsItem[];
}

function chunkArray<T>(items: readonly T[], chunkSize: number): T[][] {
  const output: T[][] = [];
  for (let start = 0; start < items.length; start += chunkSize) {
    output.push(items.slice(start, start + chunkSize));
  }
  return output;
}

function uniqueAccounts(accounts: readonly string[]): string[] {
  return [...new Set(accounts)];
}

export async function getMultipleAccounts(
  params: GetMultipleAccountsParams,
): Promise<GetMultipleAccountsResult> {
  const rpc = createSolanaRpc(params.rpcUrl ?? resolveDefaultSolanaRpcUrl(), params.rpcConfig);
  const encoding = params.encoding ?? "base64";
  const chunkSize = Math.min(
    Math.max(1, params.chunkSize ?? MAX_GET_MULTIPLE_ACCOUNTS_BATCH_SIZE),
    MAX_GET_MULTIPLE_ACCOUNTS_BATCH_SIZE,
  );
  const uniqueInputAccounts = uniqueAccounts(params.accounts);
  const inputChunks = chunkArray(uniqueInputAccounts, chunkSize);

  let contextSlot = 0n;
  const accountMap = new Map<string, unknown | null>();

  for (const chunk of inputChunks) {
    const chunkAddresses = chunk.map((item) => address(item));
    const response =
      encoding === "jsonParsed"
        ? await rpc
            .getMultipleAccounts(chunkAddresses, {
              commitment: params.commitment,
              encoding: "jsonParsed",
              minContextSlot: params.minContextSlot,
            })
            .send()
        : await rpc
            .getMultipleAccounts(chunkAddresses, {
              commitment: params.commitment,
              dataSlice: params.dataSlice,
              encoding: "base64",
              minContextSlot: params.minContextSlot,
            })
            .send();

    if (response.context.slot > contextSlot) {
      contextSlot = response.context.slot;
    }

    response.value.forEach((value, index) => {
      const targetAddress = chunk[index];
      if (targetAddress) {
        accountMap.set(targetAddress, value);
      }
    });
  }

  return {
    contextSlot,
    accounts: params.accounts.map((accountAddress) => ({
      address: accountAddress,
      account: accountMap.get(accountAddress) ?? null,
    })),
  };
}
