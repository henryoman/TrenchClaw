import { describe, expect, test } from "bun:test";

import { createGetTokenLaunchTimeAction } from "../../apps/trenchclaw/src/tools/market/getTokenLaunchTime";

const buildGeckoPoolsPayload = (input: {
  coinAddress: string;
  tokenName: string;
  tokenSymbol: string;
  poolAddress: string;
  poolCreatedAt: string;
  reserveUsd: string;
  volume24hUsd: string;
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
        pool_created_at: input.poolCreatedAt,
        reserve_in_usd: input.reserveUsd,
        volume_usd: {
          h24: input.volume24hUsd,
        },
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

describe("getTokenLaunchTimeAction", () => {
  test("uses the most liquid DexScreener pool for main_pool launch time", async () => {
    const coinAddress = "MintLaunch11111111111111111111111111111111111";
    const action = createGetTokenLaunchTimeAction({
      loadDexPairs: async () => [
        {
          chainId: "solana",
          pairAddress: "PoolSmall",
          dexId: "raydium",
          pairCreatedAt: Date.UTC(2026, 0, 10, 12, 0, 0),
          liquidity: { usd: 12_000 },
          volume: { h24: 5_000 },
          baseToken: { address: coinAddress, name: "Launch Coin", symbol: "LAUNCH" },
          quoteToken: { address: "USDC1111111111111111111111111111111111111", name: "USD Coin", symbol: "USDC" },
        },
        {
          chainId: "solana",
          pairAddress: "PoolMain",
          dexId: "meteora",
          pairCreatedAt: Date.UTC(2026, 0, 12, 15, 30, 0),
          liquidity: { usd: 250_000 },
          volume: { h24: 80_000 },
          baseToken: { address: coinAddress, name: "Launch Coin", symbol: "LAUNCH" },
          quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
        },
      ],
      loadGeckoPools: async () => {
        throw new Error("should not load gecko pools");
      },
    });

    const result = await action.execute({} as never, {
      coinAddress,
      type: "main_pool",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      coinAddress,
      type: "main_pool",
      source: "dexscreener",
      observedPoolCount: 2,
      selectedPool: {
        address: "PoolMain",
        dexId: "meteora",
        liquidityUsd: 250_000,
        tokenSide: "base",
      },
      token: {
        address: coinAddress,
        name: "Launch Coin",
        symbol: "LAUNCH",
      },
    });
    expect(result.data?.launchTimestamp).toBe(Date.UTC(2026, 0, 12, 15, 30, 0));
  });

  test("uses the earliest DexScreener pool for first_pool launch time", async () => {
    const coinAddress = "MintFirst111111111111111111111111111111111111";
    const action = createGetTokenLaunchTimeAction({
      loadDexPairs: async () => [
        {
          chainId: "solana",
          pairAddress: "PoolLater",
          dexId: "raydium",
          pairCreatedAt: Date.UTC(2026, 1, 20, 12, 0, 0),
          liquidity: { usd: 400_000 },
          volume: { h24: 120_000 },
          baseToken: { address: "USDC1111111111111111111111111111111111111", name: "USD Coin", symbol: "USDC" },
          quoteToken: { address: coinAddress, name: "First Coin", symbol: "FIRST" },
        },
        {
          chainId: "solana",
          pairAddress: "PoolEarliest",
          dexId: "orca",
          pairCreatedAt: Date.UTC(2026, 1, 18, 8, 15, 0),
          liquidity: { usd: 25_000 },
          volume: { h24: 1_500 },
          baseToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
          quoteToken: { address: coinAddress, name: "First Coin", symbol: "FIRST" },
        },
      ],
      loadGeckoPools: async () => {
        throw new Error("should not load gecko pools");
      },
    });

    const result = await action.execute({} as never, {
      coinAddress,
      type: "first_pool",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      coinAddress,
      type: "first_pool",
      source: "dexscreener",
      selectedPool: {
        address: "PoolEarliest",
        tokenSide: "quote",
      },
      token: {
        address: coinAddress,
        name: "First Coin",
        symbol: "FIRST",
      },
    });
    expect(result.data?.launchTimestamp).toBe(Date.UTC(2026, 1, 18, 8, 15, 0));
  });

  test("falls back to GeckoTerminal pool_created_at when DexScreener lacks timestamps", async () => {
    const coinAddress = "MintGecko111111111111111111111111111111111111";
    const action = createGetTokenLaunchTimeAction({
      loadDexPairs: async () => [
        {
          chainId: "solana",
          pairAddress: "PoolNoTimestamp",
          dexId: "raydium",
          liquidity: { usd: 40_000 },
          volume: { h24: 12_000 },
          baseToken: { address: coinAddress, name: "Gecko Coin", symbol: "GECKO" },
          quoteToken: { address: "USDC1111111111111111111111111111111111111", name: "USD Coin", symbol: "USDC" },
        },
      ],
      loadGeckoPools: async () => ({
        requestUrl: "https://example.com/pools",
        payload: buildGeckoPoolsPayload({
          coinAddress,
          tokenName: "Gecko Coin",
          tokenSymbol: "GECKO",
          poolAddress: "PoolGecko",
          poolCreatedAt: "2026-03-01T09:30:00Z",
          reserveUsd: "95000",
          volume24hUsd: "42000",
          baseTokenAddress: coinAddress,
          quoteTokenAddress: "USDC1111111111111111111111111111111111111",
          dexId: "raydium-clmm",
        }),
      }),
    });

    const result = await action.execute({} as never, {
      coinAddress,
      type: "main_pool",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      coinAddress,
      type: "main_pool",
      source: "geckoterminal",
      observedPoolCount: 1,
      selectedPool: {
        address: "PoolGecko",
        dexId: "raydium-clmm",
        liquidityUsd: 95_000,
        reserveUsd: 95_000,
        volume24hUsd: 42_000,
        tokenSide: "base",
      },
      token: {
        address: coinAddress,
        name: "Gecko Coin",
        symbol: "GECKO",
      },
    });
    expect(result.data?.launchIso).toBe("2026-03-01T09:30:00.000Z");
  });

  test("returns a clear validation error for unsupported launch types", async () => {
    const action = createGetTokenLaunchTimeAction({
      loadDexPairs: async () => {
        throw new Error("should not load pairs");
      },
    });

    const result = await action.execute({} as never, {
      coinAddress: "Mint111111111111111111111111111111111111111",
      type: "unknown",
    } as never);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.code).toBe("TOKEN_LAUNCH_TIME_FAILED");
    expect(result.error).toContain("Invalid option");
  });
});
