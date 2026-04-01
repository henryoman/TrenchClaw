import { describe, expect, test } from "bun:test";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/contracts/types/context";
import { createGetSwapHistoryAction } from "../../../../apps/trenchclaw/src/tools/trading/swapHistory";

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
              tokenTransfers: [],
              swap: null,
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
    }));
  });
});
