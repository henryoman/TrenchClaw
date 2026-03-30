import { afterEach, describe, expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";

import { createDownloadGeckoTerminalOhlcvAction } from "../../apps/trenchclaw/src/tools/market/downloadGeckoTerminalOhlcv";
import { runtimeStatePath } from "../helpers/corePaths";
import { createPersistedTestInstance } from "../helpers/instanceFixtures";

const TEST_INSTANCE_ID = "93";
const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;

const buildTokenPoolsPayload = (input: {
  coinAddress: string;
  tokenName: string;
  tokenSymbol: string;
  pools: Array<{
    poolAddress: string;
    reserveUsd: string;
    volume24hUsd: string;
    baseTokenAddress: string;
    quoteTokenAddress: string;
    dexId?: string;
  }>;
}) => ({
  data: input.pools.map((pool) => ({
    id: `solana_${pool.poolAddress}`,
    type: "pool",
    attributes: {
      address: pool.poolAddress,
      name: `${input.tokenSymbol} pool ${pool.poolAddress.slice(0, 6)}`,
      reserve_in_usd: pool.reserveUsd,
      volume_usd: {
        h24: pool.volume24hUsd,
      },
    },
    relationships: {
      base_token: {
        data: {
          id: `solana_${pool.baseTokenAddress}`,
          type: "token",
        },
      },
      quote_token: {
        data: {
          id: `solana_${pool.quoteTokenAddress}`,
          type: "token",
        },
      },
      dex: {
        data: {
          id: pool.dexId ?? "raydium",
          type: "dex",
        },
    },
    },
  })),
  included: (() => {
    const includedByAddress = new Map<string, {
      id: string;
      type: "token";
      attributes: {
        address: string;
        name: string;
        symbol: string;
      };
    }>();

    for (const pool of input.pools) {
      includedByAddress.set(pool.baseTokenAddress, {
        id: `solana_${pool.baseTokenAddress}`,
        type: "token",
        attributes: {
          address: pool.baseTokenAddress,
          name: pool.baseTokenAddress === input.coinAddress ? input.tokenName : "Base Token",
          symbol: pool.baseTokenAddress === input.coinAddress ? input.tokenSymbol : "BASE",
        },
      });
      includedByAddress.set(pool.quoteTokenAddress, {
        id: `solana_${pool.quoteTokenAddress}`,
        type: "token",
        attributes: {
          address: pool.quoteTokenAddress,
          name: pool.quoteTokenAddress === input.coinAddress ? input.tokenName : "Quote Token",
          symbol: pool.quoteTokenAddress === input.coinAddress ? input.tokenSymbol : "QUOTE",
        },
      });
    }

    return [...includedByAddress.values()];
  })(),
});

afterEach(async () => {
  if (previousActiveInstanceId === undefined) {
    delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
  } else {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = previousActiveInstanceId;
  }

  await rm(runtimeStatePath("instances", TEST_INSTANCE_ID), { recursive: true, force: true });
  await rm(runtimeStatePath("instances", "active-instance.json"), { force: true });
});

describe("downloadGeckoTerminalOhlcvAction", () => {
  test("resolves the main liquidity pool from coinAddress before downloading OHLC data", async () => {
    const coinAddress = "MintOhlc111111111111111111111111111111111111";
    let capturedOhlcvInput: Record<string, unknown> | null = null;
    await createPersistedTestInstance(TEST_INSTANCE_ID, { markActive: true });
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;

    const action = createDownloadGeckoTerminalOhlcvAction({
      loadTokenPools: async () => ({
        requestUrl: "https://example.com/pools",
        payload: buildTokenPoolsPayload({
          coinAddress,
          tokenName: "OHLC Coin",
          tokenSymbol: "OHLC",
          pools: [
            {
              poolAddress: "PoolLowReserve1111111111111111111111111111111",
              reserveUsd: "25000",
              volume24hUsd: "900000",
              baseTokenAddress: coinAddress,
              quoteTokenAddress: "USDC1111111111111111111111111111111111111",
            },
            {
              poolAddress: "PoolHighReserve111111111111111111111111111111",
              reserveUsd: "250000",
              volume24hUsd: "50000",
              baseTokenAddress: coinAddress,
              quoteTokenAddress: "USDC1111111111111111111111111111111111111",
              dexId: "meteora",
            },
          ],
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
                  [1_742_630_400, 1.0, 1.1, 0.95, 1.05, 1234],
                  [1_742_630_100, 0.98, 1.0, 0.94, 0.99, 1150],
                ],
              },
            },
          },
        };
      },
    });

    const result = await action.execute({} as never, {
      coinAddress,
      timeframe: "minute",
      aggregate: 5,
      limit: 2,
      includeEmptyIntervals: false,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      instanceId: TEST_INSTANCE_ID,
      coinAddress,
      candleCount: 2,
      selectedPool: {
        address: "PoolHighReserve111111111111111111111111111111",
        dexId: "meteora",
        reserveUsd: 250000,
        tokenSide: "base",
      },
      token: {
        address: coinAddress,
        name: "OHLC Coin",
        symbol: "OHLC",
      },
    });
    expect(capturedOhlcvInput).toMatchObject({
      poolAddress: "PoolHighReserve111111111111111111111111111111",
      coinAddress,
      timeframe: "minute",
      aggregate: 5,
      limit: 2,
    });

    const artifactRaw = await readFile(result.data!.outputPath, "utf8");
    const artifact = JSON.parse(artifactRaw) as {
      request?: { coinAddress?: string };
      poolResolution?: {
        candidateCount?: number;
        selectedPool?: { address?: string; tokenSide?: string };
        token?: { address?: string };
      };
    };

    expect(artifact.request?.coinAddress).toBe(coinAddress);
    expect(artifact.poolResolution?.candidateCount).toBe(2);
    expect(artifact.poolResolution?.selectedPool).toMatchObject({
      address: "PoolHighReserve111111111111111111111111111111",
      tokenSide: "base",
    });
    expect(artifact.poolResolution?.token?.address).toBe(coinAddress);
    expect(result.data?.runtimePath).toContain("output/research/market-data/geckoterminal/ohlcv/");
  });

  test("fails clearly when no GeckoTerminal pool matches the token", async () => {
    const coinAddress = "MintMissing1111111111111111111111111111111111";
    await createPersistedTestInstance(TEST_INSTANCE_ID, { markActive: true });
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;

    const action = createDownloadGeckoTerminalOhlcvAction({
      loadTokenPools: async () => ({
        requestUrl: "https://example.com/pools",
        payload: buildTokenPoolsPayload({
          coinAddress: "AnotherMint111111111111111111111111111111111",
          tokenName: "Other Coin",
          tokenSymbol: "OTHER",
          pools: [{
            poolAddress: "PoolNoMatch111111111111111111111111111111111",
            reserveUsd: "50000",
            volume24hUsd: "10000",
            baseTokenAddress: "AnotherMint111111111111111111111111111111111",
            quoteTokenAddress: "USDC1111111111111111111111111111111111111",
          }],
        }),
      }),
      loadPoolOhlcv: async () => {
        throw new Error("loadPoolOhlcv should not be called when no pool matches");
      },
    });

    const result = await action.execute({} as never, {
      coinAddress,
      timeframe: "hour",
      limit: 10,
      includeEmptyIntervals: false,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("GECKOTERMINAL_OHLC_DOWNLOAD_FAILED");
    expect(result.error).toContain(`No GeckoTerminal liquidity pool was found for coin ${coinAddress}`);
  });
});
