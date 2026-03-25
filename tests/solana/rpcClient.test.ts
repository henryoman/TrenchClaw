import { afterEach, describe, expect, test } from "bun:test";

import {
  applyRpcRateLimitCooldown,
  resetRpcRateLimitStateForTests,
  scheduleRateLimitedRpcRequest,
} from "../../apps/trenchclaw/src/solana/lib/rpc/client";

const previousHeliusRpcMinInterval = process.env.TRENCHCLAW_HELIUS_RPC_MIN_INTERVAL_MS;

afterEach(() => {
  resetRpcRateLimitStateForTests();
  if (previousHeliusRpcMinInterval === undefined) {
    delete process.env.TRENCHCLAW_HELIUS_RPC_MIN_INTERVAL_MS;
  } else {
    process.env.TRENCHCLAW_HELIUS_RPC_MIN_INTERVAL_MS = previousHeliusRpcMinInterval;
  }
});

describe("scheduleRateLimitedRpcRequest", () => {
  test("staggers Helius RPC requests by the configured minimum interval", async () => {
    process.env.TRENCHCLAW_HELIUS_RPC_MIN_INTERVAL_MS = "30";
    const startedAt: number[] = [];

    await Promise.all([
      scheduleRateLimitedRpcRequest("https://mainnet.helius-rpc.com/?api-key=test-key", async () => {
        startedAt.push(Date.now());
      }),
      scheduleRateLimitedRpcRequest("https://mainnet.helius-rpc.com/?api-key=test-key", async () => {
        startedAt.push(Date.now());
      }),
      scheduleRateLimitedRpcRequest("https://mainnet.helius-rpc.com/?api-key=test-key", async () => {
        startedAt.push(Date.now());
      }),
    ]);

    expect(startedAt).toHaveLength(3);
    const sortedStarts = [...startedAt].sort((a, b) => a - b);
    expect(sortedStarts[1]! - sortedStarts[0]!).toBeGreaterThanOrEqual(20);
    expect(sortedStarts[2]! - sortedStarts[1]!).toBeGreaterThanOrEqual(20);
  });

  test("does not delay non-Helius RPC requests", async () => {
    process.env.TRENCHCLAW_HELIUS_RPC_MIN_INTERVAL_MS = "40";
    const startedAt = Date.now();

    await Promise.all([
      scheduleRateLimitedRpcRequest("https://api.mainnet-beta.solana.com", async () => {}),
      scheduleRateLimitedRpcRequest("https://api.mainnet-beta.solana.com", async () => {}),
      scheduleRateLimitedRpcRequest("https://api.mainnet-beta.solana.com", async () => {}),
    ]);

    expect(Date.now() - startedAt).toBeLessThan(20);
  });

  test("applies adaptive cooldowns after a rate-limited request", async () => {
    const rpcUrl = "https://mainnet.helius-rpc.com/?api-key=test-key";
    applyRpcRateLimitCooldown(rpcUrl, 35, {
      providerHint: "helius-das",
      methodFamily: "getAssetsByOwner",
      lane: "inline",
    });

    const startedAt = Date.now();
    await scheduleRateLimitedRpcRequest(rpcUrl, async () => {}, {
      providerHint: "helius-das",
      methodFamily: "getAssetsByOwner",
      lane: "inline",
    });

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(25);
  });

  test("tracks per-method lanes independently", async () => {
    process.env.TRENCHCLAW_HELIUS_RPC_MIN_INTERVAL_MS = "35";
    const rpcUrl = "https://mainnet.helius-rpc.com/?api-key=test-key";
    const startedAt: Array<{ methodFamily: string; timestamp: number }> = [];

    await Promise.all([
      scheduleRateLimitedRpcRequest(rpcUrl, async () => {
        startedAt.push({ methodFamily: "getBalance", timestamp: Date.now() });
      }, {
        providerHint: "helius-rpc",
        methodFamily: "getBalance",
        lane: "inline",
      }),
      scheduleRateLimitedRpcRequest(rpcUrl, async () => {
        startedAt.push({ methodFamily: "getAssetsByOwner", timestamp: Date.now() });
      }, {
        providerHint: "helius-das",
        methodFamily: "getAssetsByOwner",
        lane: "inline",
      }),
    ]);

    expect(startedAt).toHaveLength(2);
    const getBalanceStart = startedAt.find((entry) => entry.methodFamily === "getBalance")?.timestamp ?? 0;
    const getAssetsStart = startedAt.find((entry) => entry.methodFamily === "getAssetsByOwner")?.timestamp ?? 0;
    expect(Math.abs(getBalanceStart - getAssetsStart)).toBeLessThan(25);
  });
});
