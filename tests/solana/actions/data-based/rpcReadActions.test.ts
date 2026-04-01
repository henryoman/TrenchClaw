import { describe, expect, test } from "bun:test";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/contracts/types/context";
import {
  createGetRpcAccountInfoAction,
  createGetRpcBalanceAction,
  createGetRpcMultipleAccountsAction,
  createGetRpcSignaturesForAddressAction,
  createGetRpcTokenAccountsByOwnerAction,
  createGetRpcTokenLargestAccountsAction,
  createGetRpcTokenSupplyAction,
  createGetRpcTransactionAction,
} from "../../../../apps/trenchclaw/src/tools/rpc";

const RPC_URL = "https://rpc.example";
const ACCOUNT_ONE = "So11111111111111111111111111111111111111112";
const ACCOUNT_TWO = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const OWNER_ADDRESS = "9xQeWvG816bUx9EPfK5Yw9s6o1tuVd7a3mZ9zNnV3xF";
const MINT_ADDRESS = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6f4t5D7N9m3bjsz";
const SIGNATURE = "5m3YvQY7eR8k8cTtJmJ4M1m2n3p4q5r6s7t8u9v0w1x2y3z4";

describe("rpc read actions", () => {
  test("getRpcBalance serializes bigint balance results", async () => {
    const action = createGetRpcBalanceAction({
      loadBalance: async (input) => {
        expect(input.rpcUrl).toBe(RPC_URL);
        expect(input.account).toBe(ACCOUNT_ONE);
        expect(input.minContextSlot).toBe(123n);
        return {
          contextSlot: 456n,
          lamports: 1_500_000_000n,
        };
      },
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
      rpcUrl: RPC_URL,
    }), {
      account: ACCOUNT_ONE,
      minContextSlot: 123,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      account: ACCOUNT_ONE,
      contextSlot: "456",
      lamports: "1500000000",
      sol: 1.5,
    });
  });

  test("getRpcBalance marks retryable RPC failures", async () => {
    const action = createGetRpcBalanceAction({
      loadBalance: async () => {
        throw new Error("429 Too Many Requests");
      },
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
      rpcUrl: RPC_URL,
    }), {
      account: ACCOUNT_ONE,
    });

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.code).toBe("GET_RPC_BALANCE_RATE_LIMITED");
  });

  test("getRpcAccountInfo forwards encoding and dataSlice", async () => {
    const action = createGetRpcAccountInfoAction({
      loadAccountInfo: async (input) => {
        expect(input.encoding).toBe("jsonParsed");
        expect(input.dataSlice).toEqual({ offset: 0, length: 32 });
        return {
          contextSlot: 789n,
          account: {
            lamports: 10,
            owner: "Owner111",
          },
        };
      },
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
      rpcUrl: RPC_URL,
    }), {
      account: ACCOUNT_ONE,
      encoding: "jsonParsed",
      dataSlice: { offset: 0, length: 32 },
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      account: ACCOUNT_ONE,
      encoding: "jsonParsed",
      contextSlot: "789",
      accountInfo: {
        lamports: 10,
        owner: "Owner111",
      },
    }));
  });

  test("getRpcMultipleAccounts preserves returned accounts", async () => {
    const action = createGetRpcMultipleAccountsAction({
      loadMultipleAccounts: async (input) => {
        expect(input.accounts).toEqual([ACCOUNT_ONE, ACCOUNT_TWO]);
        return {
          contextSlot: 900n,
          accounts: [
            { address: ACCOUNT_ONE, account: { executable: false } },
            { address: ACCOUNT_TWO, account: null },
          ],
        };
      },
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
      rpcUrl: RPC_URL,
    }), {
      accounts: [ACCOUNT_ONE, ACCOUNT_TWO],
      encoding: "jsonParsed",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      requested: 2,
      returned: 2,
      contextSlot: "900",
      accounts: [
        { address: ACCOUNT_ONE, account: { executable: false } },
        { address: ACCOUNT_TWO, account: null },
      ],
    }));
  });

  test("getRpcTokenAccountsByOwner forwards owner filters", async () => {
    const action = createGetRpcTokenAccountsByOwnerAction({
      loadTokenAccountsByOwner: async (input) => {
        expect(input.ownerAddress).toBe(OWNER_ADDRESS);
        expect(input.mintAddress).toBe(MINT_ADDRESS);
        expect(input.encoding).toBe("jsonParsed");
        return {
          contextSlot: 901n,
          accounts: [
            { address: ACCOUNT_ONE, account: { parsed: true } },
          ],
        };
      },
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
      rpcUrl: RPC_URL,
    }), {
      ownerAddress: OWNER_ADDRESS,
      mintAddress: MINT_ADDRESS,
      encoding: "jsonParsed",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      ownerAddress: OWNER_ADDRESS,
      filter: { mintAddress: MINT_ADDRESS },
      contextSlot: "901",
      returned: 1,
    }));
  });

  test("getRpcTokenSupply serializes supply metadata", async () => {
    const action = createGetRpcTokenSupplyAction({
      loadTokenSupply: async (input) => {
        expect(input.mintAddress).toBe(MINT_ADDRESS);
        return {
          contextSlot: 902n,
          amountRaw: 1_000_000_000n,
          decimals: 6,
          uiAmountString: "1000",
        };
      },
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
      rpcUrl: RPC_URL,
    }), {
      mintAddress: MINT_ADDRESS,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      mintAddress: MINT_ADDRESS,
      contextSlot: "902",
      amountRaw: "1000000000",
      decimals: 6,
      uiAmountString: "1000",
    });
  });

  test("getRpcTokenLargestAccounts returns the requested top slice", async () => {
    const action = createGetRpcTokenLargestAccountsAction({
      loadTokenLargestAccounts: async () => ({
        contextSlot: 903n,
        accounts: [
          { address: ACCOUNT_ONE, amountRaw: 600n, decimals: 6, uiAmountString: "0.0006" },
          { address: ACCOUNT_TWO, amountRaw: 400n, decimals: 6, uiAmountString: "0.0004" },
        ],
      }),
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
      rpcUrl: RPC_URL,
    }), {
      mintAddress: MINT_ADDRESS,
      limit: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      mintAddress: MINT_ADDRESS,
      contextSlot: "903",
      returned: 1,
      accounts: [
        {
          address: ACCOUNT_ONE,
          amountRaw: "600",
          decimals: 6,
          uiAmountString: "0.0006",
        },
      ],
    });
  });

  test("getRpcSignaturesForAddress serializes slots as strings", async () => {
    const action = createGetRpcSignaturesForAddressAction({
      loadSignaturesForAddress: async (input) => {
        expect(input.before).toBe(SIGNATURE);
        return {
          signatures: [
            {
              signature: SIGNATURE,
              slot: 904n,
              error: null,
              memo: null,
              blockTime: 1_700_000_000,
              confirmationStatus: "finalized",
            },
          ],
        };
      },
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
      rpcUrl: RPC_URL,
    }), {
      account: OWNER_ADDRESS,
      before: SIGNATURE,
      limit: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      account: OWNER_ADDRESS,
      returned: 1,
      signatures: [
        {
          signature: SIGNATURE,
          slot: "904",
          error: null,
          memo: null,
          blockTime: 1_700_000_000,
          confirmationStatus: "finalized",
        },
      ],
    });
  });

  test("getRpcTransaction returns one parsed transaction view", async () => {
    const action = createGetRpcTransactionAction({
      loadTransaction: async (input) => {
        expect(input.signature).toBe(SIGNATURE);
        expect(input.encoding).toBe("jsonParsed");
        return {
          slot: 905n,
          blockTime: 1_700_000_100,
          version: 0,
          meta: { fee: 5000 },
          transaction: { signatures: [SIGNATURE] },
        };
      },
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
      rpcUrl: RPC_URL,
    }), {
      signature: SIGNATURE,
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      signature: SIGNATURE,
      encoding: "jsonParsed",
      slot: "905",
      blockTime: 1_700_000_100,
      version: 0,
      meta: { fee: 5000 },
      transaction: { signatures: [SIGNATURE] },
    });
  });
});
