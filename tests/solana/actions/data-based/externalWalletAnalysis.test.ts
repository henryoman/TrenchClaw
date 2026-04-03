import { describe, expect, test } from "bun:test";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/contracts/types/context";
import {
  createGetExternalWalletAnalysisAction,
  createGetExternalWalletHoldingsAction,
} from "../../../../apps/trenchclaw/src/tools/wallet/getExternalWalletAnalysis";

const WALLET_ADDRESS = "9xQeWvG816bUx9EPfK5Yw9s6o1tuVd7a3mZ9zNnV3xF";

describe("external wallet analysis action", () => {
  test("returns current holdings, recent swaps, and live SOL valuation in one payload", async () => {
    const action = createGetExternalWalletAnalysisAction({
      resolvePreferredRpc: async (ctx) => {
        expect(ctx.rpcUrl).toBe("https://rpc.example");
        return {
          rpcUrl: "https://helius.example",
          useHeliusDas: true,
        };
      },
      loadWalletContents: async (input) => {
        expect(input.walletAddress).toBe(WALLET_ADDRESS);
        expect(input.rpcUrl).toBe("https://helius.example");
        expect(input.useHeliusDas).toBe(true);
        expect(input.lane).toBe("inline");
        return {
          address: input.walletAddress,
          balanceLamports: "2000000000",
          balanceSol: 2,
          tokenCount: 2,
          tokenBalances: [
            {
              mintAddress: "MintA",
              tokenProgram: "spl-token",
              programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
              balanceRaw: "1000000000",
              balance: 1000,
              balanceUiString: "1000",
              decimals: 6,
              tokenAccountAddresses: ["AtaA"],
              symbol: "ALPHA",
              name: "Alpha",
              priceUsd: 0.5,
              valueUsd: 500,
            },
            {
              mintAddress: "MintB",
              tokenProgram: "spl-token",
              programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
              balanceRaw: "200000000",
              balance: 200,
              balanceUiString: "200",
              decimals: 6,
              tokenAccountAddresses: ["AtaB"],
              symbol: "BETA",
              name: "Beta",
              priceUsd: 1,
              valueUsd: 200,
            },
          ],
          assetCount: 2,
          collectibleCount: 0,
          compressedCollectibleCount: 0,
          pricedTokenTotalUsd: 700,
          dataSource: "helius-das",
          partial: false,
          warnings: [],
          walletErrors: [],
        };
      },
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
              tokenTransfers: [],
              tokenTransferSummaryByMint: [],
              swap: null,
            },
          ],
        };
      },
      loadSolPrice: async () => ({
        priceUsd: 150,
        updatedAt: 1_710_000_000_000,
      }),
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
      rpcUrl: "https://rpc.example",
    }), {
      walletAddress: WALLET_ADDRESS,
      tradeLimit: 10,
      includeZeroBalances: false,
      topHoldingsLimit: 10,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      walletAddress: WALLET_ADDRESS,
      dataSource: "helius-das",
      partial: false,
      liveSolPrice: expect.objectContaining({
        priceUsd: 150,
        source: "shared-backend-cache",
      }),
      summary: expect.objectContaining({
        totalKnownValueUsd: 1000,
        recentTradeCount: 1,
        structuredRecentTradeCount: 1,
        mostRecentTradeAtUtcIso: "2023-11-14T22:13:20.000Z",
      }),
      holdings: expect.objectContaining({
        nativeSol: {
          balanceLamports: "2000000000",
          balanceSol: 2,
          valueUsd: 300,
        },
        tokenCount: 2,
        pricedTokenCount: 2,
        unpricedTokenCount: 0,
        pricedTokenTotalUsd: 700,
        totalKnownValueUsd: 1000,
      }),
      recentTrades: expect.objectContaining({
        returned: 1,
        sources: [{ source: "JUPITER", count: 1 }],
        mostRecentTradeAtUtcIso: "2023-11-14T22:13:20.000Z",
      }),
      recentTradesError: null,
      walletErrors: [],
    }));

    const topHoldings = result.data?.holdings.topHoldings ?? [];
    expect(topHoldings[0]).toEqual(expect.objectContaining({
      mintAddress: "MintA",
      valueUsd: 500,
    }));
    expect(topHoldings[0]?.shareOfKnownTokenValuePercent).toBeCloseTo(71.42857142857143, 10);
    expect(topHoldings[1]).toEqual(expect.objectContaining({
      mintAddress: "MintB",
      valueUsd: 200,
    }));
  });

  test("returns partial analysis when recent trades or SOL price are unavailable", async () => {
    const action = createGetExternalWalletAnalysisAction({
      resolvePreferredRpc: async () => ({
        rpcUrl: "https://rpc.example",
        useHeliusDas: false,
      }),
      loadWalletContents: async (input) => ({
        address: input.walletAddress,
        balanceLamports: "1000000000",
        balanceSol: 1,
        tokenCount: 1,
        tokenBalances: [
          {
            mintAddress: "MintOnly",
            tokenProgram: "spl-token",
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            balanceRaw: "5000000",
            balance: 5,
            balanceUiString: "5",
            decimals: 6,
            tokenAccountAddresses: ["AtaOnly"],
          },
        ],
        assetCount: 1,
        collectibleCount: 0,
        compressedCollectibleCount: 0,
        pricedTokenTotalUsd: null,
        dataSource: "rpc-sequential",
        partial: false,
        warnings: [],
        walletErrors: [],
      }),
      loadSwapHistory: async () => {
        throw new Error("429 rate limit");
      },
      loadSolPrice: async () => {
        throw new Error("SOL price unavailable");
      },
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
    }), {
      walletAddress: WALLET_ADDRESS,
      tradeLimit: 5,
      includeZeroBalances: false,
      topHoldingsLimit: 10,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      partial: true,
      liveSolPrice: expect.objectContaining({
        priceUsd: null,
        updatedAt: null,
      }),
      summary: expect.objectContaining({
        totalKnownValueUsd: null,
        recentTradeCount: 0,
      }),
      holdings: expect.objectContaining({
        pricedTokenCount: 0,
        unpricedTokenCount: 1,
        totalKnownValueUsd: null,
      }),
      recentTrades: null,
      recentTradesError: {
        code: "RECENT_TRADES_RATE_LIMITED",
        message: "429 rate limit",
        retryable: true,
      },
      warnings: [
        expect.objectContaining({ code: "RECENT_TRADES_RATE_LIMITED" }),
        expect.objectContaining({ code: "SOL_PRICE_UNAVAILABLE" }),
      ],
    }));
  });

  test("marks holdings-side upstream failures as retryable", async () => {
    const action = createGetExternalWalletAnalysisAction({
      resolvePreferredRpc: async () => ({
        rpcUrl: "https://rpc.example",
        useHeliusDas: false,
      }),
      loadWalletContents: async () => {
        throw new Error("503 upstream overloaded");
      },
      loadSwapHistory: async () => ({
        walletAddress: WALLET_ADDRESS,
        limit: 2,
        backendTimezone: "UTC",
        displayTimezone: "America/Los_Angeles",
        returned: 0,
        sources: [],
        structuredSwapCount: 0,
        swaps: [],
      }),
      loadSolPrice: async () => ({
        priceUsd: 145,
        updatedAt: 1_710_000_000_000,
      }),
    });

    const result = await action.execute(createActionContext({
      actor: "agent",
    }), {
      walletAddress: WALLET_ADDRESS,
      tradeLimit: 2,
      includeZeroBalances: false,
      topHoldingsLimit: 10,
    });

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.code).toBe("GET_EXTERNAL_WALLET_ANALYSIS_RATE_LIMITED");
  });

  test("returns a smaller holdings-only payload for wallet scan flows", async () => {
    const action = createGetExternalWalletHoldingsAction({
      resolvePreferredRpc: async () => ({
        rpcUrl: "https://rpc.example",
        useHeliusDas: false,
      }),
      loadWalletContents: async (input) => ({
        address: input.walletAddress,
        balanceLamports: "1500000000",
        balanceSol: 1.5,
        tokenCount: 2,
        tokenBalances: [
          {
            mintAddress: "MintA",
            tokenProgram: "spl-token",
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            balanceRaw: "1000000",
            balance: 1,
            balanceUiString: "1",
            decimals: 6,
            tokenAccountAddresses: ["AtaA"],
            symbol: "ALPHA",
            name: "Alpha",
            priceUsd: 2,
            valueUsd: 2,
          },
          {
            mintAddress: "MintB",
            tokenProgram: "spl-token",
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            balanceRaw: "2000000",
            balance: 2,
            balanceUiString: "2",
            decimals: 6,
            tokenAccountAddresses: ["AtaB"],
          },
        ],
        assetCount: 2,
        collectibleCount: 0,
        compressedCollectibleCount: 0,
        pricedTokenTotalUsd: 2,
        dataSource: "rpc-sequential",
        partial: false,
        warnings: [],
        walletErrors: [],
      }),
      loadSolPrice: async () => ({
        priceUsd: 100,
        updatedAt: 1_710_000_000_000,
      }),
    });

    const result = await action.execute(createActionContext({ actor: "agent" }), {
      walletAddress: WALLET_ADDRESS,
      includeZeroBalances: false,
      topHoldingsLimit: 5,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      analysisScope: "current-wallet-holdings",
      walletAddress: WALLET_ADDRESS,
      partial: false,
      summary: {
        totalKnownValueUsd: 152,
        tokenCount: 2,
        pricedTokenCount: 1,
        unpricedTokenCount: 1,
      },
    }));
    expect(result.data?.holdings.tokenCount).toBe(2);
    expect(result.data?.holdings.totalKnownValueUsd).toBe(152);
    expect(result.data?.holdings.topHoldings[0]).toEqual(expect.objectContaining({
      mintAddress: "MintA",
      valueUsd: 2,
    }));
  });
});
