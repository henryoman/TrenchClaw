import { describe, expect, test } from "bun:test";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/contracts/types/context";
import {
  createGetTokenBiggestHoldersAction,
  createGetTokenHolderDistributionAction,
  createGetTokenRecentBuyersAction,
  createRankDexscreenerTopTokenBoostsByWhalesAction,
  type TokenHolderDistribution,
} from "../../../../apps/trenchclaw/src/tools/market/tokenHolderAnalytics";

const SAMPLE_DISTRIBUTION = (overrides: Partial<TokenHolderDistribution> = {}): TokenHolderDistribution => ({
  mintAddress: "Mint111111111111111111111111111111111111111",
  analysisScope: "largest-token-accounts-window",
  decimals: 6,
  totalSupplyRaw: "1000000000",
  totalSupplyUiString: "1000",
  analyzedLargestAccountCount: 20,
  distinctOwnerCount: 12,
  analyzedOwnerShareFraction: 0.61,
  analyzedOwnerSharePercent: 61,
  whaleThresholdPercent: 1,
  whaleOwnerCount: 4,
  whaleOwnerCountAtOnePercent: 4,
  whaleOwnerCountAtFivePercent: 1,
  top1OwnerShareFraction: 0.15,
  top1OwnerSharePercent: 15,
  top5OwnerShareFraction: 0.34,
  top5OwnerSharePercent: 34,
  top10OwnerShareFraction: 0.49,
  top10OwnerSharePercent: 49,
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
      analysisScope: "largest-token-accounts-window",
      analyzedOwnerSharePercent: 61,
      whaleThresholdPercent: 2,
      top10OwnerShareFraction: 0.49,
      top10OwnerSharePercent: 49,
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

  test("getTokenBiggestHolders returns a compact top-holder view", async () => {
    const action = createGetTokenBiggestHoldersAction({
      loadHolderDistribution: async ({ mintAddress, whaleThresholdPercent, topOwnersLimit }) => {
        expect(mintAddress).toBe("MintTop");
        expect(whaleThresholdPercent).toBe(1);
        expect(topOwnersLimit).toBe(1);
        return SAMPLE_DISTRIBUTION({
          mintAddress,
          whaleThresholdPercent: whaleThresholdPercent ?? 1,
          topOwners: [
            {
              ownerAddress: "OwnerTop",
              amountRaw: "250000000",
              amountUiString: "250",
              shareFraction: 0.25,
              sharePercent: 25,
              tokenAccountCount: 2,
              tokenAccounts: ["TokenAcc1", "TokenAcc2"],
            },
            {
              ownerAddress: "OwnerSecond",
              amountRaw: "100000000",
              amountUiString: "100",
              shareFraction: 0.1,
              sharePercent: 10,
              tokenAccountCount: 1,
              tokenAccounts: ["TokenAcc3"],
            },
          ],
        });
      },
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
      rpcUrl: "https://rpc.example",
    }), {
      mintAddress: "MintTop",
      limit: 1,
      whaleThresholdPercent: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      mintAddress: "MintTop",
      analysisScope: "largest-token-accounts-window",
      analyzedOwnerSharePercent: 61,
      returned: 1,
      holders: [
        expect.objectContaining({
          ownerAddress: "OwnerTop",
          sharePercent: 25,
        }),
      ],
      concentration: expect.objectContaining({
        whaleThresholdPercent: 1,
        whaleOwnerCount: 4,
        top10OwnerSharePercent: 49,
      }),
    }));
  });

  test("getTokenRecentBuyers returns buyer summaries with explicit recent-window metadata", async () => {
    const action = createGetTokenRecentBuyersAction({
      loadRecentSwapTransactions: async ({ address, limit }) => {
        expect(address).toBe("MintRecent");
        expect(limit).toBe(20);
        return [
          {
            signature: "sig-newest",
            source: "JUPITER",
            timestamp: 1_700_000_020,
            events: {
              swap: {
                tokenInputs: [
                  {
                    userAccount: "BuyerA",
                    mint: "So11111111111111111111111111111111111111112",
                    rawTokenAmount: {
                      tokenAmount: "120000000",
                      decimals: 9,
                    },
                  },
                ],
                tokenOutputs: [
                  {
                    userAccount: "BuyerA",
                    mint: "MintRecent",
                    rawTokenAmount: {
                      tokenAmount: "2500000",
                      decimals: 6,
                    },
                  },
                ],
              },
            },
          },
          {
            signature: "sig-older",
            source: "PUMP_FUN",
            timestamp: 1_700_000_000,
            events: {
              swap: {
                tokenInputs: [
                  {
                    userAccount: "BuyerB",
                    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                    rawTokenAmount: {
                      tokenAmount: "3000000",
                      decimals: 6,
                    },
                  },
                ],
                tokenOutputs: [
                  {
                    userAccount: "BuyerA",
                    mint: "MintRecent",
                    rawTokenAmount: {
                      tokenAmount: "500000",
                      decimals: 6,
                    },
                  },
                  {
                    userAccount: "BuyerB",
                    mint: "MintRecent",
                    rawTokenAmount: {
                      tokenAmount: "1000000",
                      decimals: 6,
                    },
                  },
                ],
              },
            },
          },
        ] as any;
      },
    });

    const result = await action.execute(createActionContext({ actor: "agent" }), {
      mintAddress: "MintRecent",
      limit: 2,
      recentSwapWindow: 20,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      mintAddress: "MintRecent",
      analysisScope: "recent-swap-outputs-window",
      returned: 2,
      recentSwapWindow: 20,
      scannedSwapCount: 2,
      uniqueBuyerCountInWindow: 2,
      sources: [
        { source: "JUPITER", count: 1 },
        { source: "PUMP_FUN", count: 1 },
      ],
    }));
    expect(result.data?.buyers[0]).toEqual(expect.objectContaining({
      walletAddress: "BuyerA",
      buyCountInWindow: 2,
      receivedAmountRaw: "3000000",
      receivedAmountUiString: "3",
      lastSpentMint: "So11111111111111111111111111111111111111112",
      lastSpentAmountUiString: "0.12",
    }));
    expect(result.data?.buyers[1]).toEqual(expect.objectContaining({
      walletAddress: "BuyerB",
      buyCountInWindow: 1,
      receivedAmountUiString: "1",
      lastSpentMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      lastSpentAmountUiString: "3",
    }));
    expect(result.data?.recentBuys[0]).toEqual(expect.objectContaining({
      walletAddress: "BuyerA",
      signature: "sig-newest",
      receivedAmountUiString: "2.5",
    }));
  });

  test("getTokenRecentBuyers marks retryable upstream failures", async () => {
    const action = createGetTokenRecentBuyersAction({
      loadRecentSwapTransactions: async () => {
        throw new Error("503 temporarily unavailable");
      },
    });

    const result = await action.execute(createActionContext({ actor: "agent" }), {
      mintAddress: "MintRetry",
      limit: 5,
      recentSwapWindow: 20,
    });

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.code).toBe("GET_TOKEN_RECENT_BUYERS_RATE_LIMITED");
  });

  test("getTokenRecentBuyers does not attribute another wallet's input token as the buyer's spend", async () => {
    const action = createGetTokenRecentBuyersAction({
      loadRecentSwapTransactions: async () => [
        {
          signature: "sig-cross-wallet",
          source: "JUPITER",
          timestamp: 1_700_000_100,
          events: {
            swap: {
              tokenInputs: [
                {
                  userAccount: "WalletOther",
                  mint: "USDCMint",
                  rawTokenAmount: {
                    tokenAmount: "150000000",
                    decimals: 6,
                  },
                },
              ],
              tokenOutputs: [
                {
                  userAccount: "WalletBuyer",
                  mint: "MintRecent",
                  rawTokenAmount: {
                    tokenAmount: "42000000",
                    decimals: 6,
                  },
                },
              ],
            },
          },
        },
      ] as any,
    });

    const result = await action.execute(createActionContext({ actor: "agent" }), {
      mintAddress: "MintRecent",
      limit: 5,
      recentSwapWindow: 20,
    });

    expect(result.ok).toBe(true);
    expect(result.data?.buyers).toEqual([
      expect.objectContaining({
        walletAddress: "WalletBuyer",
        lastSpentMint: null,
        lastSpentAmountRaw: null,
        lastSpentAmountUiString: null,
      }),
    ]);
    expect(result.data?.recentBuys[0]).toEqual(expect.objectContaining({
      walletAddress: "WalletBuyer",
      spentMint: null,
      spentAmountRaw: null,
      spentAmountUiString: null,
    }));
  });
});
