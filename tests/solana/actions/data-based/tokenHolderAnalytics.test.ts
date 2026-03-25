import { describe, expect, test } from "bun:test";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/contracts/types/context";
import {
  createGetTokenHolderDistributionAction,
  createRankDexscreenerTopTokenBoostsByWhalesAction,
  type TokenHolderDistribution,
} from "../../../../apps/trenchclaw/src/tools/market/tokenHolderAnalytics";

const SAMPLE_DISTRIBUTION = (overrides: Partial<TokenHolderDistribution> = {}): TokenHolderDistribution => ({
  mintAddress: "Mint111111111111111111111111111111111111111",
  decimals: 6,
  totalSupplyRaw: "1000000000",
  totalSupplyUiString: "1000",
  analyzedLargestAccountCount: 20,
  distinctOwnerCount: 12,
  whaleThresholdPercent: 1,
  whaleOwnerCount: 4,
  whaleOwnerCountAtOnePercent: 4,
  whaleOwnerCountAtFivePercent: 1,
  top1OwnerShareFraction: 0.15,
  top5OwnerShareFraction: 0.34,
  top10OwnerShareFraction: 0.49,
  topOwners: [
    {
      ownerAddress: "Owner111",
      amountRaw: "150000000",
      amountUiString: "150",
      shareFraction: 0.15,
      sharePercent: 15,
      tokenAccountCount: 1,
      tokenAccounts: ["TokenAcc111"],
    },
  ],
  ...overrides,
});

describe("token holder analytics actions", () => {
  test("getTokenHolderDistribution forwards rpcUrl and returns holder data", async () => {
    const action = createGetTokenHolderDistributionAction({
      loadHolderDistribution: async (input) => {
        expect(input.rpcUrl).toBe("https://rpc.example");
        expect(input.mintAddress).toBe("Mint111");
        expect(input.whaleThresholdPercent).toBe(2);
        expect(input.topOwnersLimit).toBe(3);
        return SAMPLE_DISTRIBUTION({
          mintAddress: input.mintAddress,
          whaleThresholdPercent: input.whaleThresholdPercent ?? 1,
        });
      },
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
      rpcUrl: "https://rpc.example",
    }), {
      mintAddress: "Mint111",
      whaleThresholdPercent: 2,
      topOwnersLimit: 3,
    });

    expect(result.ok).toBe(true);
    expect(result.retryable).toBe(false);
    expect(result.data).toEqual(expect.objectContaining({
      mintAddress: "Mint111",
      whaleThresholdPercent: 2,
      top10OwnerShareFraction: 0.49,
    }));
  });

  test("rankDexscreenerTopTokenBoostsByWhales sorts by whale count then concentration", async () => {
    const action = createRankDexscreenerTopTokenBoostsByWhalesAction({
      loadTopTokenBoosts: async () => [
        { chainId: "solana", tokenAddress: "MintA", amount: 80, totalAmount: 400, description: "Alpha" },
        { chainId: "solana", tokenAddress: "MintB", amount: 90, totalAmount: 500, description: "Beta" },
        { chainId: "solana", tokenAddress: "MintC", amount: 60, totalAmount: 300, description: "Gamma" },
      ],
      loadTokenPairs: async () => [
        {
          chainId: "solana",
          pairAddress: "PairA",
          baseToken: { address: "MintA", name: "Alpha", symbol: "ALPHA" },
          priceChange: { m5: 1.5, h1: 4.2, h24: 19.8 },
          liquidity: { usd: 25_000 },
          volume: { h24: 400_000 },
          marketCap: 1_000_000,
          fdv: 1_500_000,
        },
        {
          chainId: "solana",
          pairAddress: "PairB",
          baseToken: { address: "MintB", name: "Beta", symbol: "BETA" },
          priceChange: { m5: -0.6, h1: 2.1, h24: 14.4 },
          liquidity: { usd: 30_000 },
          volume: { h24: 500_000 },
          marketCap: 2_000_000,
          fdv: 2_500_000,
        },
        {
          chainId: "solana",
          pairAddress: "PairC",
          baseToken: { address: "MintC", name: "Gamma", symbol: "GAMMA" },
          priceChange: { m5: 3.4, h1: 9.1, h24: 22.7 },
          liquidity: { usd: 12_000 },
          volume: { h24: 125_000 },
          marketCap: 700_000,
          fdv: 900_000,
        },
      ],
      loadHolderDistribution: async ({ mintAddress, whaleThresholdPercent }) => {
        expect(whaleThresholdPercent).toBe(1);
        switch (mintAddress) {
          case "MintA":
            return SAMPLE_DISTRIBUTION({
              mintAddress,
              whaleOwnerCount: 5,
              whaleOwnerCountAtOnePercent: 5,
              top10OwnerShareFraction: 0.41,
            });
          case "MintB":
            return SAMPLE_DISTRIBUTION({
              mintAddress,
              whaleOwnerCount: 7,
              whaleOwnerCountAtOnePercent: 7,
              top10OwnerShareFraction: 0.37,
            });
          default:
            return SAMPLE_DISTRIBUTION({
              mintAddress,
              whaleOwnerCount: 7,
              whaleOwnerCountAtOnePercent: 7,
              top10OwnerShareFraction: 0.52,
            });
        }
      },
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
      rpcUrl: "https://rpc.example",
    }), {
      limit: 3,
      whaleThresholdPercent: 1,
      topOwnersLimit: 4,
    });

    expect(result.ok).toBe(true);
    expect(result.data?.ranking.map((entry) => entry.tokenAddress)).toEqual(["MintC", "MintB", "MintA"]);
    expect(result.data?.winner).toEqual(expect.objectContaining({
      tokenAddress: "MintC",
      tokenName: "Gamma",
      tokenSymbol: "GAMMA",
      whaleOwnerCount: 7,
      top10OwnerShareFraction: 0.52,
    }));
    expect(result.data?.ranking[0]).toEqual(expect.objectContaining({
      pricePerformance5mPercent: 3.4,
      pricePerformance1hPercent: 9.1,
      pricePerformance24hPercent: 22.7,
      liquidityUsd: 12_000,
      volume24hUsd: 125_000,
      marketCapUsd: 700_000,
      fdvUsd: 900_000,
    }));
  });
});
