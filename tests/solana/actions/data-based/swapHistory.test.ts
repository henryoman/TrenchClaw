import { describe, expect, test } from "bun:test";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/contracts/types/context";
import { createGetSwapHistoryAction, getSwapHistory } from "../../../../apps/trenchclaw/src/tools/trading/swapHistory";

const WALLET_ADDRESS = "9xQeWvG816bUx9EPfK5Yw9s6o1tuVd7a3mZ9zNnV3xF";

describe("swap history action", () => {
  test("defaults to a compact 10-swap routine shape", async () => {
    const action = createGetSwapHistoryAction({
      loadSwapHistory: async (input) => {
        expect(input.walletAddress).toBe(WALLET_ADDRESS);
        expect(input.limit).toBe(10);
        return {
          walletAddress: input.walletAddress,
          limit: input.limit,
          backendTimezone: "UTC",
          displayTimezone: "America/Los_Angeles",
          returned: 1,
          sources: [{ source: "JUPITER", count: 1 }],
          structuredSwapCount: 1,
          swaps: [
            {
              signature: "sig-1",
              description: "swap",
              source: "JUPITER",
              type: "SWAP",
              feeLamports: 5000,
              timestampUnixSecondsUtc: 1_700_000_000,
              timestampUtcIso: "2023-11-14T22:13:20.000Z",
              datePacific: "11/14/2023",
              timePacific: "02:13:20 PM",
              dateTimePacific: "11/14/2023, 02:13:20 PM PST",
              tokenTransfers: [
                {
                  mint: "MintIn",
                  tokenAmount: 2.5,
                  tokenStandard: "Fungible",
                },
                {
                  mint: "MintIn",
                  tokenAmount: 1.5,
                  tokenStandard: "Fungible",
                },
              ],
              tokenTransferSummaryByMint: [
                {
                  mint: "MintIn",
                  tokenStandard: "Fungible",
                  totalTokenAmount: 4,
                  transferCount: 2,
                },
              ],
              swap: {
                nativeInput: null,
                nativeOutput: null,
                tokenInputs: [{
                  userAccount: WALLET_ADDRESS,
                  mint: "MintIn",
                  tokenAmountRaw: "4000000",
                  decimals: 6,
                  tokenAmountUiString: "4",
                }],
                tokenOutputs: [{
                  userAccount: WALLET_ADDRESS,
                  mint: "MintOut",
                  tokenAmountRaw: "1250000",
                  decimals: 6,
                  tokenAmountUiString: "1.25",
                }],
              },
            },
          ],
        };
      },
    });

    const parsedInput = action.inputSchema!.parse({
      walletAddress: WALLET_ADDRESS,
    });
    const result = await action.execute(createActionContext({
      actor: "agent",
      rpcUrl: "https://rpc.example",
    }), parsedInput);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      walletAddress: WALLET_ADDRESS,
      limit: 10,
      returned: 1,
      sources: [{ source: "JUPITER", count: 1 }],
      structuredSwapCount: 1,
      swaps: [
        expect.objectContaining({
          tokenTransferSummaryByMint: [
            {
              mint: "MintIn",
              tokenStandard: "Fungible",
              totalTokenAmount: 4,
              transferCount: 2,
            },
          ],
          swap: expect.objectContaining({
            tokenInputs: [
              expect.objectContaining({
                tokenAmountRaw: "4000000",
                tokenAmountUiString: "4",
              }),
            ],
            tokenOutputs: [
              expect.objectContaining({
                tokenAmountRaw: "1250000",
                tokenAmountUiString: "1.25",
              }),
            ],
          }),
        }),
      ],
    }));
  });

  test("marks retryable swap history failures", async () => {
    const action = createGetSwapHistoryAction({
      loadSwapHistory: async () => {
        throw new Error("account index service overloaded, please try again.");
      },
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
      rpcUrl: "https://rpc.example",
    }), {
      walletAddress: WALLET_ADDRESS,
      limit: 2,
    });

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.code).toBe("SWAP_HISTORY_RATE_LIMITED");
  });

  test("treats not-found swap history as an empty result", async () => {
    const originalFetch = globalThis.fetch;
    const originalEnvApiKey = process.env.TRENCHCLAW_VAULT_FILE;
    process.env.TRENCHCLAW_VAULT_FILE = "/tmp/trenchclaw-test-vault.json";

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "Not Found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    try {
      await Bun.write("/tmp/trenchclaw-test-vault.json", JSON.stringify({
        rpc: {
          default: {
            "provider-id": "helius",
            "api-key": "test-helius-key",
            "http-url": "https://mainnet.helius-rpc.com/?api-key=test-helius-key",
          },
        },
      }));

      const result = await getSwapHistory({
        walletAddress: WALLET_ADDRESS,
        limit: 3,
      });

      expect(result.returned).toBe(0);
      expect(result.swaps).toEqual([]);
      expect(result.structuredSwapCount).toBe(0);
      expect(result.sources).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnvApiKey === undefined) {
        delete process.env.TRENCHCLAW_VAULT_FILE;
      } else {
        process.env.TRENCHCLAW_VAULT_FILE = originalEnvApiKey;
      }
    }
  });
});
