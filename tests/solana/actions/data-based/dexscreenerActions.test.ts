import { afterEach, describe, expect, test } from "bun:test";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/runtime/types/context";
import {
  getDexscreenerLatestAdsAction,
  getDexscreenerLatestCommunityTakeoversAction,
  getDexscreenerLatestTokenBoostsAction,
  getDexscreenerLatestTokenProfilesAction,
  getDexscreenerOrdersByTokenAction,
  getDexscreenerPairByChainAndPairIdAction,
  getDexscreenerTokenPairsByChainAction,
  getDexscreenerTokensByChainAction,
  getDexscreenerTopTokenBoostsAction,
  searchDexscreenerPairsAction,
} from "../../../../apps/trenchclaw/src/solana/actions/data-fetch/api/dexscreener-actions";

const previousFetch = globalThis.fetch;

const createJsonResponse = (payload: unknown, init?: {
  status?: number;
  headers?: Record<string, string>;
}) =>
  new Response(JSON.stringify(payload), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

const asMockFetch = (
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch => handler as unknown as typeof fetch;

afterEach(() => {
  globalThis.fetch = previousFetch;
});

describe("dexscreener data-fetch actions", () => {
  test("loads latest token profiles and filters to Solana", async () => {
    globalThis.fetch = asMockFetch(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      expect(url.pathname).toBe("/token-profiles/latest/v1");
      return createJsonResponse([
        { chainId: "solana", tokenAddress: "So111", description: "solana token" },
        { chainId: "ethereum", tokenAddress: "Eth111", description: "ethereum token" },
      ]);
    });

    const result = await getDexscreenerLatestTokenProfilesAction.execute(createActionContext({ actor: "agent" }), {});

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      expect.objectContaining({
        chainId: "solana",
        tokenAddress: "So111",
      }),
    ]);
  });

  test("loads latest token boosts and filters to Solana", async () => {
    globalThis.fetch = asMockFetch(async () =>
      createJsonResponse([
        { chainId: "solana", tokenAddress: "Bonk111", amount: 1, totalAmount: 2 },
        { chainId: "bsc", tokenAddress: "Bsc111", amount: 3, totalAmount: 4 },
      ]));

    const result = await getDexscreenerLatestTokenBoostsAction.execute(createActionContext({ actor: "agent" }), {});

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      expect.objectContaining({
        chainId: "solana",
        tokenAddress: "Bonk111",
      }),
    ]);
  });

  test("loads top token boosts and filters to Solana", async () => {
    globalThis.fetch = asMockFetch(async () =>
      createJsonResponse([
        { chainId: "solana", tokenAddress: "Jup111", amount: 9, totalAmount: 9 },
        { chainId: "base", tokenAddress: "Base111", amount: 1, totalAmount: 1 },
      ]));

    const result = await getDexscreenerTopTokenBoostsAction.execute(createActionContext({ actor: "agent" }), {});

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      expect.objectContaining({
        chainId: "solana",
        tokenAddress: "Jup111",
      }),
    ]);
  });

  test("loads order status by token", async () => {
    globalThis.fetch = asMockFetch(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      expect(url.pathname).toBe("/orders/v1/solana/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN");
      return createJsonResponse({
        orders: [
          {
            type: "tokenProfile",
            status: "processing",
          },
        ],
        boosts: [],
      });
    });

    const result = await getDexscreenerOrdersByTokenAction.execute(createActionContext({ actor: "agent" }), {
      tokenAddress: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      expect.objectContaining({
        status: "processing",
      }),
    ]);
  });

  test("searches pairs and filters to Solana results", async () => {
    globalThis.fetch = asMockFetch(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      expect(url.pathname).toBe("/latest/dex/search");
      expect(url.searchParams.get("q")).toBe("bonk sol");
      return createJsonResponse({
        schemaVersion: "1.0.0",
        pairs: [
          {
            chainId: "solana",
            pairAddress: "Pair111",
          },
          {
            chainId: "ethereum",
            pairAddress: "Pair222",
          },
        ],
      });
    });

    const result = await searchDexscreenerPairsAction.execute(createActionContext({ actor: "agent" }), {
      query: "bonk sol",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      schemaVersion: "1.0.0",
      pairs: [
        expect.objectContaining({
          chainId: "solana",
          pairAddress: "Pair111",
        }),
      ],
    });
  });

  test("loads a pair by chain and pair id", async () => {
    globalThis.fetch = asMockFetch(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      expect(url.pathname).toBe("/latest/dex/pairs/solana/8HoQnePLqPj4M7PUDzfw8e3Ymdwgc7NLGnaTUapubyvu");
      return createJsonResponse({
        schemaVersion: "1.0.0",
        pair: {
          chainId: "solana",
          pairAddress: "8HoQnePLqPj4M7PUDzfw8e3Ymdwgc7NLGnaTUapubyvu",
          dexId: "raydium",
        },
      });
    });

    const result = await getDexscreenerPairByChainAndPairIdAction.execute(createActionContext({ actor: "agent" }), {
      pairAddress: "8HoQnePLqPj4M7PUDzfw8e3Ymdwgc7NLGnaTUapubyvu",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        chainId: "solana",
        dexId: "raydium",
      }),
    );
  });

  test("loads token pairs by chain", async () => {
    globalThis.fetch = asMockFetch(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      expect(url.pathname).toBe("/token-pairs/v1/solana/DezXAZ8z7PnrnRJjz3wXBoRgixCa6f4t5D7N9m3bjsz");
      return createJsonResponse([
        {
          chainId: "solana",
          pairAddress: "Pair111",
        },
      ]);
    });

    const result = await getDexscreenerTokenPairsByChainAction.execute(createActionContext({ actor: "agent" }), {
      tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6f4t5D7N9m3bjsz",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      expect.objectContaining({
        pairAddress: "Pair111",
      }),
    ]);
  });

  test("loads tokens by chain and removes duplicate token addresses", async () => {
    globalThis.fetch = asMockFetch(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      expect(url.pathname).toBe(
        "/tokens/v1/solana/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN,DezXAZ8z7PnrnRJjz3wXBoRgixCa6f4t5D7N9m3bjsz",
      );
      return createJsonResponse([
        {
          chainId: "solana",
          pairAddress: "Pair111",
        },
        {
          chainId: "solana",
          pairAddress: "Pair222",
        },
      ]);
    });

    const result = await getDexscreenerTokensByChainAction.execute(createActionContext({ actor: "agent" }), {
      tokenAddresses: [
        "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        "DezXAZ8z7PnrnRJjz3wXBoRgixCa6f4t5D7N9m3bjsz",
        "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      expect.objectContaining({ pairAddress: "Pair111" }),
      expect.objectContaining({ pairAddress: "Pair222" }),
    ]);
  });

  test("loads latest community takeovers and filters to Solana", async () => {
    globalThis.fetch = asMockFetch(async () =>
      createJsonResponse([
        { chainId: "solana", tokenAddress: "Take111" },
        { chainId: "ethereum", tokenAddress: "Take222" },
      ]));

    const result = await getDexscreenerLatestCommunityTakeoversAction.execute(createActionContext({ actor: "agent" }), {});

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      expect.objectContaining({
        chainId: "solana",
        tokenAddress: "Take111",
      }),
    ]);
  });

  test("loads latest ads and filters to Solana", async () => {
    globalThis.fetch = asMockFetch(async () =>
      createJsonResponse([
        { chainId: "solana", tokenAddress: "Ad111", type: "banner" },
        { chainId: "base", tokenAddress: "Ad222", type: "banner" },
      ]));

    const result = await getDexscreenerLatestAdsAction.execute(createActionContext({ actor: "agent" }), {});

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      expect.objectContaining({
        chainId: "solana",
        tokenAddress: "Ad111",
      }),
    ]);
  });

  test("marks exhausted retryable Dexscreener failures as retryable", async () => {
    let requestCount = 0;
    globalThis.fetch = asMockFetch(async () => {
      requestCount += 1;
      return createJsonResponse(
        { error: "rate limited" },
        {
          status: 429,
          headers: {
            "retry-after": "0",
          },
        },
      );
    });

    const result = await getDexscreenerLatestTokenProfilesAction.execute(createActionContext({ actor: "agent" }), {});

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.code).toBe("DEXSCREENER_ACTION_RETRYABLE");
    expect(requestCount).toBe(3);
  });

  test("fails clearly when Dexscreener returns an invalid payload shape", async () => {
    globalThis.fetch = asMockFetch(async () => createJsonResponse({ nope: true }));

    const result = await getDexscreenerLatestTokenBoostsAction.execute(createActionContext({ actor: "agent" }), {});

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.error).toContain("invalid response shape");
  });
});
