import { afterEach, describe, expect, test } from "bun:test";

import {
  getGeckoTerminalTokenPools,
  resetGeckoTerminalRateLimitStateForTests,
} from "../../../../apps/trenchclaw/src/solana/lib/clients/geckoterminal";

const previousFetch = globalThis.fetch;
const previousMinInterval = process.env.TRENCHCLAW_GECKOTERMINAL_MIN_INTERVAL_MS;
const previousCacheTtl = process.env.TRENCHCLAW_GECKOTERMINAL_CACHE_TTL_MS;
const previousCooldown = process.env.TRENCHCLAW_GECKOTERMINAL_RATE_LIMIT_COOLDOWN_MS;

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
  resetGeckoTerminalRateLimitStateForTests();
  if (previousMinInterval === undefined) {
    delete process.env.TRENCHCLAW_GECKOTERMINAL_MIN_INTERVAL_MS;
  } else {
    process.env.TRENCHCLAW_GECKOTERMINAL_MIN_INTERVAL_MS = previousMinInterval;
  }
  if (previousCacheTtl === undefined) {
    delete process.env.TRENCHCLAW_GECKOTERMINAL_CACHE_TTL_MS;
  } else {
    process.env.TRENCHCLAW_GECKOTERMINAL_CACHE_TTL_MS = previousCacheTtl;
  }
  if (previousCooldown === undefined) {
    delete process.env.TRENCHCLAW_GECKOTERMINAL_RATE_LIMIT_COOLDOWN_MS;
  } else {
    process.env.TRENCHCLAW_GECKOTERMINAL_RATE_LIMIT_COOLDOWN_MS = previousCooldown;
  }
});

describe("geckoterminal client throttling", () => {
  test("stages distinct requests through one shared minimum interval", async () => {
    process.env.TRENCHCLAW_GECKOTERMINAL_MIN_INTERVAL_MS = "25";
    process.env.TRENCHCLAW_GECKOTERMINAL_CACHE_TTL_MS = "0";
    const startedAt: number[] = [];

    globalThis.fetch = asMockFetch(async () => {
      startedAt.push(Date.now());
      return createJsonResponse({ data: [], included: [] });
    });

    await Promise.all([
      getGeckoTerminalTokenPools({ tokenAddress: "Mint111111111111111111111111111111111111111" }),
      getGeckoTerminalTokenPools({ tokenAddress: "Mint222222222222222222222222222222222222222" }),
      getGeckoTerminalTokenPools({ tokenAddress: "Mint333333333333333333333333333333333333333" }),
    ]);

    expect(startedAt).toHaveLength(3);
    const sortedStarts = [...startedAt].sort((left, right) => left - right);
    expect(sortedStarts[1]! - sortedStarts[0]!).toBeGreaterThanOrEqual(18);
    expect(sortedStarts[2]! - sortedStarts[1]!).toBeGreaterThanOrEqual(18);
  });

  test("dedupes in-flight identical requests and serves immediate cache hits", async () => {
    process.env.TRENCHCLAW_GECKOTERMINAL_MIN_INTERVAL_MS = "0";
    process.env.TRENCHCLAW_GECKOTERMINAL_CACHE_TTL_MS = "60000";
    let fetchCount = 0;

    globalThis.fetch = asMockFetch(async () => {
      fetchCount += 1;
      await Bun.sleep(10);
      return createJsonResponse({ data: [], included: [] });
    });

    await Promise.all([
      getGeckoTerminalTokenPools({ tokenAddress: "Mint111111111111111111111111111111111111111" }),
      getGeckoTerminalTokenPools({ tokenAddress: "Mint111111111111111111111111111111111111111" }),
    ]);
    await getGeckoTerminalTokenPools({ tokenAddress: "Mint111111111111111111111111111111111111111" });

    expect(fetchCount).toBe(1);
  });

  test("applies shared cooldown after a 429 before the next network start", async () => {
    process.env.TRENCHCLAW_GECKOTERMINAL_MIN_INTERVAL_MS = "0";
    process.env.TRENCHCLAW_GECKOTERMINAL_CACHE_TTL_MS = "0";
    process.env.TRENCHCLAW_GECKOTERMINAL_RATE_LIMIT_COOLDOWN_MS = "40";
    const startedAt: Array<{ url: string; timestamp: number }> = [];
    let firstRequestAttempt = 0;

    globalThis.fetch = asMockFetch(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      startedAt.push({ url, timestamp: Date.now() });
      if (url.includes("Mint111111111111111111111111111111111111111")) {
        firstRequestAttempt += 1;
        if (firstRequestAttempt === 1) {
          return createJsonResponse({ errors: [{ status: "429", title: "Too Many Requests" }] }, { status: 429 });
        }
      }
      return createJsonResponse({ data: [], included: [] });
    });

    await Promise.all([
      getGeckoTerminalTokenPools({ tokenAddress: "Mint111111111111111111111111111111111111111" }),
      getGeckoTerminalTokenPools({ tokenAddress: "Mint222222222222222222222222222222222222222" }),
    ]);

    expect(startedAt.length).toBeGreaterThanOrEqual(3);
    const sortedStarts = [...startedAt].sort((left, right) => left.timestamp - right.timestamp);
    expect(sortedStarts[1]!.timestamp - sortedStarts[0]!.timestamp).toBeGreaterThanOrEqual(30);
  });
});
