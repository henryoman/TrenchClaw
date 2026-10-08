import { afterEach, describe, expect, test } from "bun:test";

import { getHeliusEnhancedTransactionsByAddress } from "../../../../apps/trenchclaw/src/solana/lib/clients/heliusEnhanced";
import { getDexscreenerPairByChainAndPairId } from "../../../../apps/trenchclaw/src/solana/lib/clients/dexscreener";
import {
  getCryptoAssetSentiment,
  getCryptoFearGreedIndex,
  getCryptoNewsLatest,
  searchCryptoNews,
} from "../../../../apps/trenchclaw/src/solana/lib/clients/cryptocurrencyCv";
import { createJupiterUltraAdapter } from "../../../../apps/trenchclaw/src/solana/lib/jupiter/ultra";

const previousFetch = globalThis.fetch;
const wallet = "So11111111111111111111111111111111111111112";
afterEach(() => { globalThis.fetch = previousFetch; });

describe("current market API contracts", () => {
  test("reads Dexscreener's documented pairs array and preserves the legacy pair field", async () => {
    const pair = { chainId: "solana", pairAddress: "pair-address", dexId: "raydium" };
    for (const payload of [{ pairs: [pair] }, { pair }, { pairs: [], pair }, { pairs: null }, { pair: null }]) {
      globalThis.fetch = (async () => Response.json(payload)) as unknown as typeof fetch;
      const result = await getDexscreenerPairByChainAndPairId({ pairAddress: "pair-address" });
      expect(result).toEqual("pairs" in payload ? (payload.pairs?.[0] ?? null) : payload.pair);
    }
  });

  test("requests parsed Helius swaps with authentication, sorting and continuation", async () => {
    const transaction = { signature: "signature", events: { swap: { nativeInput: { amount: "10" } } } };
    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe(`https://api-mainnet.helius-rpc.com/v0/addresses/${wallet}/transactions`);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        "api-key": "test-key", limit: "20", "sort-order": "desc", type: "SWAP", "before-signature": "previous-signature",
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json([transaction]);
    }) as typeof fetch;
    expect(await getHeliusEnhancedTransactionsByAddress({
      apiKey: "test-key", address: wallet, limit: 20, type: "SWAP", beforeSignature: "previous-signature",
    })).toEqual([transaction]);
  });

  test("preserves Helius status and continuation errors while redacting credentials", async () => {
    globalThis.fetch = (async () => Response.json({ error: { message: "set before-signature previous-signature test-key" } }, { status: 429 })) as unknown as typeof fetch;
    await expect(getHeliusEnhancedTransactionsByAddress({ apiKey: "test-key", address: wallet, limit: 10 }))
      .rejects.toThrow("Helius HTTP 429: set before-signature previous-signature [redacted]");
    globalThis.fetch = (async () => { throw new Error("network https://host/?api-key=test-key"); }) as unknown as typeof fetch;
    await expect(getHeliusEnhancedTransactionsByAddress({ apiKey: "test-key", address: wallet, limit: 10 }))
      .rejects.toThrow("Helius enhanced history request failed or timed out.");
  });

  test("rejects malformed Helius history instead of treating it as no swaps", async () => {
    for (const payload of [{ transactions: [] }, [{ events: {} }], null]) {
      globalThis.fetch = (async () => Response.json(payload)) as unknown as typeof fetch;
      await expect(getHeliusEnhancedTransactionsByAddress({ apiKey: "test-key", address: wallet, limit: 10 }))
        .rejects.toThrow("invalid transaction array");
    }
  });

  test("uses canonical news endpoints and upstream pagination parameters", async () => {
    const urls: URL[] = [];
    globalThis.fetch = (async (input) => { urls.push(new URL(String(input))); return Response.json({}); }) as typeof fetch;
    await getCryptoNewsLatest({ page: 2, perPage: 7 });
    await searchCryptoNews({ query: "solana", perPage: 5 });
    await getCryptoAssetSentiment({ asset: "SOL" });
    await getCryptoFearGreedIndex();
    expect(urls.map((url) => url.pathname)).toEqual(["/api/news", "/api/search", "/api/sentiment", "/api/fear-greed"]);
    expect(Object.fromEntries(urls[0]!.searchParams)).toEqual({ page: "2", per_page: "7", limit: "7" });
    expect(Object.fromEntries(urls[1]!.searchParams)).toEqual({ q: "solana", limit: "5" });
    await expect(searchCryptoNews({ query: "solana", page: 2 })).rejects.toThrow("does not support pagination");
    expect(urls).toHaveLength(4);
  });

  test("rejects unsupported ExactOut managed orders before sending a request", () => {
    const adapter = createJupiterUltraAdapter({ apiKey: "test-key", fetchImpl: (() => { throw new Error("unexpected fetch"); }) as unknown as typeof fetch });
    for (const mode of [{ mode: "ExactOut" as const }, { swapMode: "ExactOut" as const }]) {
      expect(() => adapter.getOrder({ inputMint: wallet, outputMint: wallet, amount: 10, ...mode }))
        .toThrow("support ExactIn only");
    }
  });
});
