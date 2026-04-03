#!/usr/bin/env bun

import assert from "node:assert/strict";

import { createActionContext } from "../apps/trenchclaw/src/ai/contracts/types/context";
import { resolveHeliusRpcConfig } from "../apps/trenchclaw/src/solana/lib/rpc/helius";
import { readManagedWalletLibraryEntries } from "../apps/trenchclaw/src/solana/lib/wallet/walletManager";
import { resolvePrimaryRuntimeEndpoints } from "../apps/trenchclaw/src/runtime/settings/endpoints";
import { loadRuntimeSettings } from "../apps/trenchclaw/src/runtime/settings/runtimeLoader";
import { getTokenRecentBuyersAction } from "../apps/trenchclaw/src/tools/market/tokenHolderAnalytics";
import {
  getExternalWalletAnalysisAction,
  getExternalWalletHoldingsAction,
} from "../apps/trenchclaw/src/tools/wallet/getExternalWalletAnalysis";

const PUBLIC_RPC_FALLBACK = "https://api.mainnet-beta.solana.com";
const DEFAULT_WALLET_CANDIDATES = [
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "675kPX9MHTjS2zt1qfr1NYHuzefQS8HfQJ79Yv3EGn2Z",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
] as const;
const DEFAULT_RECENT_BUYER_MINT_CANDIDATES = [
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6f4t5D7N9m3bjsz",
  "So11111111111111111111111111111111111111112",
] as const;
const RETRY_DELAYS_MS = [0, 1_500, 3_000, 6_000];

interface ActionResult<TData> {
  ok: boolean;
  retryable?: boolean;
  error?: string;
  data?: TData;
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

const resolveWalletAddress = async (
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

  throw new Error("Unable to find a live wallet with holdings and recent swaps on the selected RPC.");
};

const resolveRecentBuyerMint = async (
  ctx: ReturnType<typeof createActionContext>,
): Promise<{ mintAddress: string; source: string }> => {
  const explicitMint = process.env.TRENCHCLAW_TOKEN_RECENT_BUYERS_TEST_MINT?.trim();
  const candidates = [
    ...(explicitMint ? [explicitMint] : []),
    ...DEFAULT_RECENT_BUYER_MINT_CANDIDATES,
  ].filter((value, index, values) => values.indexOf(value) === index);

  for (const mintAddress of candidates) {
    const result = await getTokenRecentBuyersAction.execute(ctx, {
      mintAddress,
      limit: 5,
      recentSwapWindow: 20,
    });
    if (result.ok && (result.data?.returned ?? 0) > 0) {
      return {
        mintAddress,
        source: mintAddress === explicitMint ? "env" : "auto-probed",
      };
    }
  }

  throw new Error("Unable to find a token mint with recent buyers on the selected RPC.");
};

const main = async (): Promise<void> => {
  const resolvedRpc = await resolveManualSmokeRpcUrl();
  const ctx = createActionContext({
    actor: "agent",
    rpcUrl: resolvedRpc.rpcUrl,
  });
  const resolvedWallet = await resolveWalletAddress(ctx);
  const resolvedMint = await resolveRecentBuyerMint(ctx);

  const analysis = await runWithRetries("getExternalWalletAnalysis", async () =>
    await getExternalWalletAnalysisAction.execute(ctx, {
      walletAddress: resolvedWallet.walletAddress,
      tradeLimit: 5,
      includeZeroBalances: false,
      topHoldingsLimit: 5,
    }),
  );
  const holdings = await runWithRetries("getExternalWalletHoldings", async () =>
    await getExternalWalletHoldingsAction.execute(ctx, {
      walletAddress: resolvedWallet.walletAddress,
      includeZeroBalances: false,
      topHoldingsLimit: 5,
    }),
  );
  const recentBuyers = await runWithRetries("getTokenRecentBuyers", async () =>
    await getTokenRecentBuyersAction.execute(ctx, {
      mintAddress: resolvedMint.mintAddress,
      limit: 5,
      recentSwapWindow: 20,
    }),
  );

  assert.equal(analysis.analysisScope, "wallet-holdings-plus-recent-swaps");
  assert.equal(holdings.analysisScope, "current-wallet-holdings");
  assert.equal(recentBuyers.analysisScope, "recent-swap-outputs-window");
  assert.equal(analysis.walletAddress, holdings.walletAddress);
  assert.equal(analysis.holdings.tokenCount, holdings.holdings.tokenCount);
  assert.equal(analysis.holdings.nativeSol.balanceLamports, holdings.holdings.nativeSol.balanceLamports);
  assert.ok((analysis.recentTrades?.returned ?? 0) > 0, "expected recent wallet trades");
  assert.ok(holdings.holdings.topHoldings.length > 0, "expected top wallet holdings");
  assert.ok(recentBuyers.returned > 0, "expected recent buyers");
  assert.ok(recentBuyers.buyers[0]?.mostRecentBuySignature, "expected buyer signature metadata");
  assert.ok(typeof analysis.liveSolPrice.priceUsd === "number" && analysis.liveSolPrice.priceUsd > 0, "expected live SOL price");

  console.log(`[manual-wallet-intel] rpcUrl=${sanitizeRpcUrl(resolvedRpc.rpcUrl)}`);
  console.log(`[manual-wallet-intel] rpcSource=${resolvedRpc.source}`);
  console.log(`[manual-wallet-intel] walletAddress=${resolvedWallet.walletAddress}`);
  console.log(`[manual-wallet-intel] walletAddressSource=${resolvedWallet.source}`);
  console.log(`[manual-wallet-intel] tokenRecentBuyersMint=${resolvedMint.mintAddress}`);
  console.log(`[manual-wallet-intel] tokenRecentBuyersMintSource=${resolvedMint.source}`);
  console.log(`[manual-wallet-intel] analysisScope=${analysis.analysisScope}`);
  console.log(`[manual-wallet-intel] holdingsScope=${holdings.analysisScope}`);
  console.log(`[manual-wallet-intel] recentBuyersScope=${recentBuyers.analysisScope}`);
  console.log(`[manual-wallet-intel] walletTokenCount=${holdings.holdings.tokenCount}`);
  console.log(`[manual-wallet-intel] walletKnownValueUsd=${holdings.holdings.totalKnownValueUsd ?? "null"}`);
  console.log(`[manual-wallet-intel] walletRecentTrades=${analysis.recentTrades?.returned ?? 0}`);
  console.log(`[manual-wallet-intel] tokenRecentBuyerCount=${recentBuyers.returned}`);
  console.log("[manual-wallet-intel] OK");
  console.log(JSON.stringify({
    rpcUrl: sanitizeRpcUrl(resolvedRpc.rpcUrl),
    rpcSource: resolvedRpc.source,
    walletAddress: resolvedWallet.walletAddress,
    walletAddressSource: resolvedWallet.source,
    walletAnalysis: {
      analysisScope: analysis.analysisScope,
      partial: analysis.partial,
      liveSolPrice: analysis.liveSolPrice,
      summary: analysis.summary,
      topHoldings: analysis.holdings.topHoldings,
      recentTrades: analysis.recentTrades
        ? {
            returned: analysis.recentTrades.returned,
            structuredSwapCount: analysis.recentTrades.structuredSwapCount,
            sources: analysis.recentTrades.sources,
            mostRecentTradeAtUtcIso: analysis.recentTrades.mostRecentTradeAtUtcIso,
            sampleSwaps: analysis.recentTrades.swaps.slice(0, 2),
          }
        : null,
      warnings: analysis.warnings,
    },
    walletHoldings: {
      analysisScope: holdings.analysisScope,
      partial: holdings.partial,
      summary: holdings.summary,
      topHoldings: holdings.holdings.topHoldings,
      warnings: holdings.warnings,
    },
    tokenRecentBuyers: {
      mintAddress: resolvedMint.mintAddress,
      analysisScope: recentBuyers.analysisScope,
      returned: recentBuyers.returned,
      scannedSwapCount: recentBuyers.scannedSwapCount,
      uniqueBuyerCountInWindow: recentBuyers.uniqueBuyerCountInWindow,
      sources: recentBuyers.sources,
      buyers: recentBuyers.buyers,
      recentBuysSample: recentBuyers.recentBuys.slice(0, 5),
    },
  }, null, 2));
};

await main();
