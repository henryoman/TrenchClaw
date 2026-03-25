import { describe, expect, test } from "bun:test";

import { createGetTokenPricePerformanceAction } from "../../apps/trenchclaw/src/tools/market/getTokenPricePerformance";

const buildTokenPoolsPayload = (input: {
  coinAddress: string;
  tokenName: string;
  tokenSymbol: string;
  poolAddress: string;
  reserveUsd: string;
  volume24hUsd: string;
  baseTokenPriceUsd: string | null;
  quoteTokenPriceUsd: string | null;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  dexId?: string;
}) => ({
  data: [
    {
      id: `solana_${input.poolAddress}`,
      type: "pool",
      attributes: {
        address: input.poolAddress,
        name: `${input.tokenSymbol} pool`,
        reserve_in_usd: input.reserveUsd,
        volume_usd: {
          h24: input.volume24hUsd,
        },
        base_token_price_usd: input.baseTokenPriceUsd,
        quote_token_price_usd: input.quoteTokenPriceUsd,
      },
      relationships: {
        base_token: {
          data: {
            id: `solana_${input.baseTokenAddress}`,
            type: "token",
          },
        },
        quote_token: {
          data: {
            id: `solana_${input.quoteTokenAddress}`,
            type: "token",
          },
        },
        dex: {
          data: {
            id: input.dexId ?? "raydium",
            type: "dex",
          },
        },
      },
    },
  ],
  included: [
    {
      id: `solana_${input.baseTokenAddress}`,
      type: "token",
      attributes: {
        address: input.baseTokenAddress,
        name: input.baseTokenAddress === input.coinAddress ? input.tokenName : "Base Token",
        symbol: input.baseTokenAddress === input.coinAddress ? input.tokenSymbol : "BASE",
      },
    },
    {
      id: `solana_${input.quoteTokenAddress}`,
      type: "token",
      attributes: {
        address: input.quoteTokenAddress,
        name: input.quoteTokenAddress === input.coinAddress ? input.tokenName : "Quote Token",
        symbol: input.quoteTokenAddress === input.coinAddress ? input.tokenSymbol : "QUOTE",
      },
    },
  ],
});

describe("getTokenPricePerformanceAction", () => {
  test("computes positive price performance for a base-side token with only coinAddress and lookback", async () => {
    const coinAddress = "MintBase1111111111111111111111111111111111111";
    const now = Date.UTC(2026, 2, 22, 18, 0, 0);
    let capturedOhlcvInput: Record<string, unknown> | null = null;
    const action = createGetTokenPricePerformanceAction({
      now: () => now,
      loadTokenPools: async () => ({
        requestUrl: "https://example.com/pools",
        payload: buildTokenPoolsPayload({
          coinAddress,
          tokenName: "Managed Coin",
          tokenSymbol: "MC",
          poolAddress: "PoolBase111111111111111111111111111111111111",
          reserveUsd: "250000",
          volume24hUsd: "80000",
          baseTokenPriceUsd: "1.5",
          quoteTokenPriceUsd: "1",
          baseTokenAddress: coinAddress,
          quoteTokenAddress: "USDC1111111111111111111111111111111111111",
        }),
      }),
      loadPoolOhlcv: async (input) => {
        capturedOhlcvInput = input as unknown as Record<string, unknown>;
        return {
          requestUrl: "https://example.com/ohlcv",
          payload: {
            data: {
              attributes: {
                ohlcv_list: [
                  [Math.floor(now / 1000), 1.45, 1.51, 1.4, 1.49, 1000],
                  [Math.floor(now / 1000) - 3600, 0.95, 1.02, 0.9, 1.0, 900],
                  [Math.floor(now / 1000) - 7200, 0.9, 0.96, 0.88, 0.95, 850],
                ],
              },
            },
          },
        };
      },
    });

    const result = await action.execute({} as never, {
      coinAddress,
      lookback: "1 hr",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      coinAddress,
      lookback: "1h",
      currentPriceUsd: 1.5,
      historicalPriceUsd: 1.0,
      priceChangeUsd: 0.5,
      selectedPool: {
        address: "PoolBase111111111111111111111111111111111111",
        tokenSide: "base",
      },
      token: {
        address: coinAddress,
        name: "Managed Coin",
        symbol: "MC",
      },
      candle: {
        timeframe: "minute",
        aggregate: 1,
        intervalSeconds: 60,
      },
    });
    expect(result.data?.priceChangePercent).toBe(50);
    expect(capturedOhlcvInput).toMatchObject({
      poolAddress: "PoolBase111111111111111111111111111111111111",
      coinAddress,
      timeframe: "minute",
      aggregate: 1,
      limit: 63,
    });
  });

  test("uses quote-side pool pricing and a coarser candle plan for longer lookbacks", async () => {
    const coinAddress = "MintQuote111111111111111111111111111111111111";
    const now = Date.UTC(2026, 2, 22, 18, 0, 0);
    let capturedOhlcvInput: Record<string, unknown> | null = null;
    const action = createGetTokenPricePerformanceAction({
      now: () => now,
      loadTokenPools: async () => ({
        requestUrl: "https://example.com/pools",
        payload: buildTokenPoolsPayload({
          coinAddress,
          tokenName: "Quote Coin",
          tokenSymbol: "QC",
          poolAddress: "PoolQuote1111111111111111111111111111111111",
          reserveUsd: "125000",
          volume24hUsd: "50000",
          baseTokenPriceUsd: "150",
          quoteTokenPriceUsd: "0.25",
          baseTokenAddress: "SOL111111111111111111111111111111111111111",
          quoteTokenAddress: coinAddress,
          dexId: "meteora",
        }),
      }),
      loadPoolOhlcv: async (input) => {
        capturedOhlcvInput = input as unknown as Record<string, unknown>;
        return {
          requestUrl: "https://example.com/ohlcv",
          payload: {
            data: {
              attributes: {
                ohlcv_list: [
                  [Math.floor(now / 1000), 0.24, 0.26, 0.23, 0.25, 1500],
                  [Math.floor(now / 1000) - 86400, 0.49, 0.52, 0.45, 0.5, 1400],
                  [Math.floor(now / 1000) - 86400 - 300, 0.5, 0.55, 0.48, 0.51, 1300],
                ],
              },
            },
          },
        };
      },
    });

    const result = await action.execute({} as never, {
      coinAddress,
      lookback: "24h",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      coinAddress,
      lookback: "24h",
      currentPriceUsd: 0.25,
      historicalPriceUsd: 0.5,
      priceChangeUsd: -0.25,
      selectedPool: {
        address: "PoolQuote1111111111111111111111111111111111",
        dexId: "meteora",
        tokenSide: "quote",
      },
      token: {
        address: coinAddress,
        name: "Quote Coin",
        symbol: "QC",
      },
      candle: {
        timeframe: "minute",
        aggregate: 5,
        intervalSeconds: 300,
      },
    });
    expect(result.data?.priceChangePercent).toBe(-50);
    expect(capturedOhlcvInput).toMatchObject({
      timeframe: "minute",
      aggregate: 5,
      limit: 291,
    });
  });

  test("falls back from a stale higher-ranked pool to a fresher pool", async () => {
    const coinAddress = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const now = Date.UTC(2026, 2, 22, 18, 0, 0);
    const requestedPools: string[] = [];
    const action = createGetTokenPricePerformanceAction({
      now: () => now,
      loadTokenPools: async () => ({
        requestUrl: "https://example.com/pools",
        payload: {
          data: [
            {
              id: "pool-stale",
              type: "pool",
              attributes: {
                address: "PoolStale",
                name: "BCH / USDC",
                reserve_in_usd: "999999999",
                volume_usd: { h24: "99999999" },
                base_token_price_usd: "300",
                quote_token_price_usd: "1",
              },
              relationships: {
                base_token: { data: { id: "token-bch", type: "token" } },
                quote_token: { data: { id: "token-usdc", type: "token" } },
                dex: { data: { id: "raydium-clmm", type: "dex" } },
              },
            },
            {
              id: "pool-fresh",
              type: "pool",
              attributes: {
                address: "PoolFresh",
                name: "SOL / USDC",
                reserve_in_usd: "5000000",
                volume_usd: { h24: "50000000" },
                base_token_price_usd: "150",
                quote_token_price_usd: "1.001",
              },
              relationships: {
                base_token: { data: { id: "token-sol", type: "token" } },
                quote_token: { data: { id: "token-usdc", type: "token" } },
                dex: { data: { id: "orca", type: "dex" } },
              },
            },
          ],
          included: [
            {
              id: "token-bch",
              type: "token",
              attributes: {
                address: "BCH111111111111111111111111111111111111111",
                name: "BCH",
                symbol: "BCH",
              },
            },
            {
              id: "token-sol",
              type: "token",
              attributes: {
                address: "So11111111111111111111111111111111111111112",
                name: "Wrapped SOL",
                symbol: "SOL",
              },
            },
            {
              id: "token-usdc",
              type: "token",
              attributes: {
                address: coinAddress,
                name: "USD Coin",
                symbol: "USDC",
              },
            },
          ],
        },
      }),
      loadPoolOhlcv: async (input) => {
        requestedPools.push(input.poolAddress);
        if (input.poolAddress === "PoolStale") {
          return {
            requestUrl: "https://example.com/ohlcv-stale",
            payload: {
              data: {
                attributes: {
                  ohlcv_list: [
                    [Math.floor(now / 1000) - 6 * 3600, 1.0, 1.0, 1.0, 1.0, 100],
                    [Math.floor(now / 1000) - 6 * 3600 - 60, 1.0, 1.0, 1.0, 1.0, 100],
                  ],
                },
              },
            },
          };
        }
        return {
          requestUrl: "https://example.com/ohlcv-fresh",
          payload: {
            data: {
              attributes: {
                ohlcv_list: [
                  [Math.floor(now / 1000), 1.0, 1.002, 0.999, 1.001, 1000],
                  [Math.floor(now / 1000) - 3600, 0.998, 1.0, 0.997, 0.999, 800],
                ],
              },
            },
          },
        };
      },
    });

    const result = await action.execute({} as never, {
      coinAddress,
      lookback: "1h",
    });

    expect(result.ok).toBe(true);
    expect(requestedPools).toEqual(["PoolStale", "PoolFresh"]);
    expect(result.data?.currentPriceUsd).toBeCloseTo(1.001, 12);
    expect(result.data?.historicalPriceUsd).toBeCloseTo(0.999, 12);
    expect(result.data?.priceChangeUsd).toBeCloseTo(0.002, 12);
    expect(result.data?.selectedPool).toMatchObject({
      address: "PoolFresh",
      tokenSide: "quote",
    });
    expect(result.data?.token).toMatchObject({
      address: coinAddress,
      name: "USD Coin",
      symbol: "USDC",
    });
  });

  test("returns a clear validation error for unsupported lookback strings", async () => {
    const action = createGetTokenPricePerformanceAction({
      loadTokenPools: async () => {
        throw new Error("should not load pools");
      },
    });

    const result = await action.execute({} as never, {
      coinAddress: "Mint111111111111111111111111111111111111111",
      lookback: "soon",
    });

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.code).toBe("TOKEN_PRICE_PERFORMANCE_FAILED");
    expect(result.error).toContain("Invalid `lookback`");
  });
});
