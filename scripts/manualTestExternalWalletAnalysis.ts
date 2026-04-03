#!/usr/bin/env bun

import assert from "node:assert/strict";

import { createActionContext } from "../apps/trenchclaw/src/ai/contracts/types/context";
import { resolveHeliusRpcConfig } from "../apps/trenchclaw/src/solana/lib/rpc/helius";
import { readManagedWalletLibraryEntries } from "../apps/trenchclaw/src/solana/lib/wallet/walletManager";
import { loadRuntimeSettings } from "../apps/trenchclaw/src/runtime/settings/runtimeLoader";
import { resolvePrimaryRuntimeEndpoints } from "../apps/trenchclaw/src/runtime/settings/endpoints";
import { getExternalWalletAnalysisAction } from "../apps/trenchclaw/src/tools/wallet/getExternalWalletAnalysis";

const PUBLIC_RPC_FALLBACK = "https://api.mainnet-beta.solana.com";
const DEFAULT_WALLET_CANDIDATES = [
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "675kPX9MHTjS2zt1qfr1NYHuzefQS8HfQJ79Yv3EGn2Z",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
] as const;
const RETRY_DELAYS_MS = [0, 1_500, 3_000, 6_000];

interface ActionResult<TData> {
  ok: boolean;
  retryable?: boolean;
  error?: string;
  data?: TData;
}

interface ExternalWalletAnalysisLike {
  partial: boolean;
  liveSolPrice: {
    priceUsd: number | null;
    updatedAt: number | null;
  };
  holdings: {
    tokenCount: number;
    totalKnownValueUsd: number | null;
    topHoldings: Array<{
      mintAddress: string;
      symbol: string | null;
      valueUsd: number | null;
    }>;
  };
  recentTrades: {
    returned: number;
    structuredSwapCount: number;
    mostRecentTradeAtUtcIso: string | null;
  } | null;
}

const sanitizeRpcUrl = (value: string): string => {
  const parsed = new URL(value);
  parsed.search = "";
  return parsed.toString();
};

const ensureSuccess = <TData>(label: string, result: ActionResult<TData>): TData => {
  if (!result.ok) {
    throw new Error(`${label} failed: ${result.error ?? "unknown error"}`);
  }
  return result.data as TData;
};

const runWithRetries = async <TData>(
  label: string,
  execute: () => Promise<ActionResult<TData>>,
): Promise<TData> => {
  let lastResult: ActionResult<TData> | null = null;

  for (const [attemptIndex, delayMs] of RETRY_DELAYS_MS.entries()) {
    if (delayMs > 0) {
      await Bun.sleep(delayMs);
    }

    const result = await execute();
    if (result.ok) {
      return result.data as TData;
    }
    lastResult = result;
    if (!result.retryable || attemptIndex === RETRY_DELAYS_MS.length - 1) {
      break;
    }
  }

  return ensureSuccess(label, lastResult ?? { ok: false, error: "action did not run" });
};

const resolveManualSmokeRpcUrl = async (): Promise<{ rpcUrl: string; source: string }> => {
  const explicitRpcUrl = process.env.TRENCHCLAW_RPC_URL?.trim() || process.env.RPC_URL?.trim();
  if (explicitRpcUrl) {
    return { rpcUrl: explicitRpcUrl, source: "env" };
  }

  try {
    const runtimeSettings = await loadRuntimeSettings();
    const runtimeEndpoints = resolvePrimaryRuntimeEndpoints(runtimeSettings);
    const helius = await resolveHeliusRpcConfig({
      rpcUrl: runtimeEndpoints.rpcUrl,
      requireSelectedProvider: false,
    });
    if (helius.rpcUrl) {
      return { rpcUrl: helius.rpcUrl, source: helius.source ?? "vault-helius" };
    }
    return { rpcUrl: runtimeEndpoints.rpcUrl, source: "runtime-settings" };
  } catch {
    return { rpcUrl: PUBLIC_RPC_FALLBACK, source: "public-fallback" };
  }
};

const resolveWalletAnalysisAddress = async (
  ctx: ReturnType<typeof createActionContext>,
): Promise<{ walletAddress: string; source: string }> => {
  const explicitAddress = process.env.TRENCHCLAW_WALLET_ANALYSIS_TEST_ADDRESS?.trim();
  const managedWalletCandidates = await readManagedWalletLibraryEntries({ allowMissing: true })
    .then((walletLibrary) => walletLibrary.entries.map((entry) => entry.address))
    .catch(() => []);
  const candidates = [
    ...(explicitAddress ? [explicitAddress] : []),
    ...managedWalletCandidates,
    ...DEFAULT_WALLET_CANDIDATES,
  ].filter((value, index, values) => values.indexOf(value) === index);

  for (const walletAddress of candidates) {
    const result = await getExternalWalletAnalysisAction.execute(ctx, {
      walletAddress,
      tradeLimit: 3,
      includeZeroBalances: false,
      topHoldingsLimit: 3,
    });
    if (
      result.ok
      && result.data
      && result.data.partial === false
      && typeof result.data.liveSolPrice.priceUsd === "number"
      && result.data.holdings.tokenCount > 0
      && (result.data.recentTrades?.returned ?? 0) > 0
    ) {
      return {
        walletAddress,
        source:
          walletAddress === explicitAddress
            ? "env"
            : managedWalletCandidates.includes(walletAddress)
              ? "managed-wallet-library"
              : "auto-probed",
      };
    }
  }

  throw new Error("Unable to find a wallet address with current holdings, recent swaps, and live SOL valuation on the selected RPC.");
};

const main = async (): Promise<void> => {
  const resolvedRpc = await resolveManualSmokeRpcUrl();
  const ctx = createActionContext({
    actor: "agent",
    rpcUrl: resolvedRpc.rpcUrl,
  });
  const resolvedWallet = await resolveWalletAnalysisAddress(ctx);

  console.log(`[manual-external-wallet-analysis] rpcUrl=${sanitizeRpcUrl(resolvedRpc.rpcUrl)}`);
  console.log(`[manual-external-wallet-analysis] rpcSource=${resolvedRpc.source}`);
  console.log(`[manual-external-wallet-analysis] walletAddress=${resolvedWallet.walletAddress}`);
  console.log(`[manual-external-wallet-analysis] walletAddressSource=${resolvedWallet.source}`);

  const analysis = await runWithRetries<ExternalWalletAnalysisLike>("getExternalWalletAnalysis", async () =>
    await getExternalWalletAnalysisAction.execute(ctx, {
      walletAddress: resolvedWallet.walletAddress,
      tradeLimit: 5,
      includeZeroBalances: false,
      topHoldingsLimit: 5,
    }),
  );

  assert.equal(analysis.partial, false, "expected full wallet analysis payload");
  assert.ok(typeof analysis.liveSolPrice.priceUsd === "number" && analysis.liveSolPrice.priceUsd > 0, "expected live SOL/USD price");
  assert.ok(typeof analysis.liveSolPrice.updatedAt === "number" && analysis.liveSolPrice.updatedAt > 0, "expected SOL price timestamp");
  assert.ok(analysis.holdings.tokenCount > 0, "expected token holdings");
  assert.ok((analysis.recentTrades?.returned ?? 0) > 0, "expected recent trades");
  assert.ok((analysis.recentTrades?.structuredSwapCount ?? 0) >= 0, "expected structured swap count");
  assert.ok(analysis.recentTrades?.mostRecentTradeAtUtcIso, "expected most recent trade timestamp");
  assert.ok(analysis.holdings.topHoldings.length > 0, "expected top holdings summary");

  console.log("[manual-external-wallet-analysis] OK");
  console.log(JSON.stringify({
    rpcUrl: sanitizeRpcUrl(resolvedRpc.rpcUrl),
    rpcSource: resolvedRpc.source,
    walletAddress: resolvedWallet.walletAddress,
    walletAddressSource: resolvedWallet.source,
    liveSolPriceUsd: analysis.liveSolPrice.priceUsd,
    liveSolPriceUpdatedAt: analysis.liveSolPrice.updatedAt,
    holdings: {
      tokenCount: analysis.holdings.tokenCount,
      totalKnownValueUsd: analysis.holdings.totalKnownValueUsd,
      topHoldings: analysis.holdings.topHoldings,
    },
    recentTrades: analysis.recentTrades,
  }, null, 2));
};

await main();
