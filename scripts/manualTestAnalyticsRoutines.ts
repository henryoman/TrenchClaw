#!/usr/bin/env bun

import assert from "node:assert/strict";

import { createActionContext } from "../apps/trenchclaw/src/ai/contracts/types/context";
import {
  getTokenBiggestHoldersAction,
  getTokenHolderDistributionAction,
} from "../apps/trenchclaw/src/tools/market/tokenHolderAnalytics";
import { getSwapHistoryAction } from "../apps/trenchclaw/src/tools/trading/swapHistory";
import { getRpcTokenLargestAccountsAction } from "../apps/trenchclaw/src/tools/rpc";
import { resolveHeliusRpcConfig } from "../apps/trenchclaw/src/solana/lib/rpc/helius";
import { resolvePrimaryRuntimeEndpoints } from "../apps/trenchclaw/src/runtime/settings/endpoints";
import { loadRuntimeSettings } from "../apps/trenchclaw/src/runtime/settings/runtimeLoader";

const PUBLIC_RPC_FALLBACK = "https://api.mainnet-beta.solana.com";
const DEFAULT_TEST_MINT_CANDIDATES = [
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  "Es9vMFrzaCERmJfrF4H2FYD5vQj8sR6v7SxrLQY6t7y",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
] as const;
const DEFAULT_SWAP_ADDRESS_CANDIDATES = [
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "675kPX9MHTjS2zt1qfr1NYHuzefQS8HfQJ79Yv3EGn2Z",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
] as const;
const RETRY_DELAYS_MS = [0, 1_500, 3_000, 6_000];

interface ActionResult<TData> {
  ok: boolean;
  retryable?: boolean;
  error?: string;
  code?: string;
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

const resolveManualSmokeMint = async (
  ctx: ReturnType<typeof createActionContext>,
): Promise<{ mintAddress: string; source: string }> => {
  const explicitMint = process.env.TRENCHCLAW_RPC_TEST_MINT?.trim();
  if (explicitMint) {
    return { mintAddress: explicitMint, source: "env" };
  }

  for (const mintAddress of DEFAULT_TEST_MINT_CANDIDATES) {
    const result = await (async (): Promise<ActionResult<unknown>> => {
      let last: ActionResult<unknown> | null = null;
      for (const [attemptIndex, delayMs] of RETRY_DELAYS_MS.entries()) {
        if (delayMs > 0) {
          await Bun.sleep(delayMs);
        }
        const current = await getRpcTokenLargestAccountsAction.execute(ctx, {
          mintAddress,
          limit: 1,
        });
        if (current.ok) {
          return current;
        }
        last = current;
        if (!current.retryable || attemptIndex === RETRY_DELAYS_MS.length - 1) {
          break;
        }
      }
      return last ?? { ok: false, error: "mint probe did not run" };
    })();
    if (result.ok) {
      return { mintAddress, source: "auto-probed" };
    }
  }

  throw new Error("Unable to find a live test mint that supports getRpcTokenLargestAccounts on the selected RPC.");
};

const resolveSwapHistoryAddress = async (
  ctx: ReturnType<typeof createActionContext>,
): Promise<{ walletAddress: string; source: string }> => {
  const explicitAddress = process.env.TRENCHCLAW_SWAP_HISTORY_TEST_ADDRESS?.trim();
  const candidates = explicitAddress
    ? [explicitAddress, ...DEFAULT_SWAP_ADDRESS_CANDIDATES]
    : [...DEFAULT_SWAP_ADDRESS_CANDIDATES];

  for (const walletAddress of candidates) {
    const result = await getSwapHistoryAction.execute(ctx, {
      walletAddress,
      limit: 2,
    });
    if (result.ok && (result.data?.returned ?? 0) > 0) {
      return {
        walletAddress,
        source: walletAddress === explicitAddress ? "env" : "auto-probed",
      };
    }
  }

  throw new Error("Unable to find an address with recent swap history on the selected Helius setup.");
};

const main = async (): Promise<void> => {
  const resolvedRpc = await resolveManualSmokeRpcUrl();
  const ctx = createActionContext({
    actor: "agent",
    rpcUrl: resolvedRpc.rpcUrl,
  });
  const resolvedMint = await resolveManualSmokeMint(ctx);
  const resolvedSwapAddress = await resolveSwapHistoryAddress(ctx);

  console.log(`[manual-analytics-routines] rpcUrl=${sanitizeRpcUrl(resolvedRpc.rpcUrl)}`);
  console.log(`[manual-analytics-routines] rpcSource=${resolvedRpc.source}`);
  console.log(`[manual-analytics-routines] mint=${resolvedMint.mintAddress}`);
  console.log(`[manual-analytics-routines] mintSource=${resolvedMint.source}`);
  console.log(`[manual-analytics-routines] swapHistoryAddress=${resolvedSwapAddress.walletAddress}`);
  console.log(`[manual-analytics-routines] swapHistoryAddressSource=${resolvedSwapAddress.source}`);

  const distribution = await runWithRetries("getTokenHolderDistribution", async () =>
    await getTokenHolderDistributionAction.execute(ctx, {
      mintAddress: resolvedMint.mintAddress,
      whaleThresholdPercent: 1,
      topOwnersLimit: 5,
    }),
  );
  assert.equal(distribution.analysisScope, "largest-token-accounts-window");
  assert.ok(distribution.analyzedOwnerShareFraction > 0, "expected analyzed holder coverage");
  assert.ok(distribution.topOwners.length > 0, "expected top owner entries");
  assert.ok(distribution.top10OwnerSharePercent >= distribution.top5OwnerSharePercent);
  assert.ok(distribution.top5OwnerSharePercent >= distribution.top1OwnerSharePercent);
  assert.ok(distribution.topOwners[0]?.tokenAccounts.length, "expected owner token accounts");

  const biggestHolders = await runWithRetries("getTokenBiggestHolders", async () =>
    await getTokenBiggestHoldersAction.execute(ctx, {
      mintAddress: resolvedMint.mintAddress,
      limit: 5,
      whaleThresholdPercent: 1,
    }),
  );
  assert.equal(biggestHolders.analysisScope, "largest-token-accounts-window");
  assert.ok(biggestHolders.returned > 0, "expected biggest holders");
  assert.ok(biggestHolders.returned <= 5, "expected holder limit to be respected");
  assert.ok(biggestHolders.holders[0]?.sharePercent !== undefined, "expected top holder share percent");
  assert.ok(biggestHolders.concentration.top10OwnerSharePercent >= biggestHolders.concentration.top1OwnerSharePercent);

  const swapHistory = await runWithRetries("getSwapHistory", async () =>
    await getSwapHistoryAction.execute(ctx, {
      walletAddress: resolvedSwapAddress.walletAddress,
      limit: 5,
    }),
  );
  assert.ok(swapHistory.returned > 0, "expected recent swap history");
  assert.ok(swapHistory.sources.length > 0, "expected swap source summary");
  const firstSwap = swapHistory.swaps[0];
  assert.ok(firstSwap, "expected at least one swap");
  assert.ok(
    firstSwap.swap !== null || firstSwap.tokenTransferSummaryByMint.length > 0,
    "expected structured swap data or token transfer summary",
  );
  if (firstSwap.swap) {
    const firstLeg = firstSwap.swap.tokenInputs[0] ?? firstSwap.swap.tokenOutputs[0] ?? null;
    assert.ok(firstLeg !== null, "expected structured token legs");
    assert.ok(
      firstLeg?.tokenAmountUiString !== null || firstLeg?.tokenAmountRaw !== null,
      "expected structured token amount fields",
    );
  }

  console.log("[manual-analytics-routines] OK");
  console.log(JSON.stringify({
    rpcUrl: sanitizeRpcUrl(resolvedRpc.rpcUrl),
    rpcSource: resolvedRpc.source,
    mintAddress: resolvedMint.mintAddress,
    mintSource: resolvedMint.source,
    holderDistribution: {
      analyzedOwnerSharePercent: distribution.analyzedOwnerSharePercent,
      whaleOwnerCount: distribution.whaleOwnerCount,
      top1OwnerSharePercent: distribution.top1OwnerSharePercent,
      top5OwnerSharePercent: distribution.top5OwnerSharePercent,
      top10OwnerSharePercent: distribution.top10OwnerSharePercent,
      topOwner: distribution.topOwners[0] ?? null,
    },
    biggestHolders: {
      returned: biggestHolders.returned,
      firstHolder: biggestHolders.holders[0] ?? null,
      concentration: biggestHolders.concentration,
    },
    swapHistory: {
      walletAddress: resolvedSwapAddress.walletAddress,
      walletAddressSource: resolvedSwapAddress.source,
      returned: swapHistory.returned,
      sources: swapHistory.sources,
      structuredSwapCount: swapHistory.structuredSwapCount,
      firstSwap,
    },
  }, null, 2));
};

await main();
