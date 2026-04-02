#!/usr/bin/env bun

import assert from "node:assert/strict";

import { createActionContext } from "../apps/trenchclaw/src/ai/contracts/types/context";
import { resolveHeliusRpcConfig } from "../apps/trenchclaw/src/solana/lib/rpc/helius";
import { createTokenAccountAdapter } from "../apps/trenchclaw/src/solana/lib/rpc/tokenAccount";
import {
  getRpcAccountInfoAction,
  getRpcBalanceAction,
  getRpcMultipleAccountsAction,
  getRpcSignaturesForAddressAction,
  getRpcTokenAccountsByOwnerAction,
  getRpcTokenLargestAccountsAction,
  getRpcTokenSupplyAction,
  getRpcTransactionAction,
} from "../apps/trenchclaw/src/tools/rpc";
import { resolvePrimaryRuntimeEndpoints } from "../apps/trenchclaw/src/runtime/settings/endpoints";
import { loadRuntimeSettings } from "../apps/trenchclaw/src/runtime/settings/runtimeLoader";

const PUBLIC_RPC_FALLBACK = "https://api.mainnet-beta.solana.com";
const DEFAULT_TEST_MINT_CANDIDATES = [
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  "Es9vMFrzaCERmJfrF4H2FYD5vQj8sR6v7SxrLQY6t7y",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "So11111111111111111111111111111111111111112",
] as const;
const RETRY_DELAYS_MS = [0, 1_500, 3_000, 6_000];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

interface RpcActionResult<TData> {
  ok: boolean;
  retryable?: boolean;
  error?: string;
  code?: string;
  data?: TData;
}

const ensureActionSuccess = <TData>(
  label: string,
  result: RpcActionResult<TData>,
): TData => {
  if (!result.ok) {
    throw new Error(`${label} failed: ${result.error ?? "unknown error"}`);
  }
  return result.data as TData;
};

const executeActionWithRetries = async <TData>(
  label: string,
  execute: () => Promise<RpcActionResult<TData>>,
): Promise<TData> => {
  let lastResult: RpcActionResult<TData> | null = null;

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

    const nextDelayMs = RETRY_DELAYS_MS[attemptIndex + 1] ?? 0;
    console.warn(`[manual-rpc-reads] retry ${label} after ${nextDelayMs}ms`, {
      code: result.code ?? null,
      error: result.error ?? null,
    });
  }

  return ensureActionSuccess(label, lastResult ?? { ok: false, error: "action did not run" });
};

const parseTokenAmountUi = (value: unknown): number => {
  if (!isRecord(value)) {
    return 0;
  }
  if (typeof value.uiAmount === "number" && Number.isFinite(value.uiAmount)) {
    return value.uiAmount;
  }
  if (typeof value.uiAmountString === "string" && value.uiAmountString.trim().length > 0) {
    const parsed = Number(value.uiAmountString);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const parseParsedTokenAccountInfo = (value: unknown): {
  ownerAddress: string;
  mintAddress: string;
  tokenAmountUi: number;
  decimals: number | null;
} => {
  assert.ok(isRecord(value), "expected token account info record");
  const accountData = value.accountInfo;
  assert.ok(isRecord(accountData), "expected accountInfo in getRpcAccountInfo result");
  assert.ok(isRecord(accountData.data), "expected account data");
  assert.ok(isRecord(accountData.data.parsed), "expected parsed account data");
  assert.ok(isRecord(accountData.data.parsed.info), "expected parsed token account info");

  const parsedInfo = accountData.data.parsed.info;
  assert.equal(typeof parsedInfo.owner, "string", "expected parsed token account owner");
  assert.equal(typeof parsedInfo.mint, "string", "expected parsed token account mint");

  const tokenAmount = isRecord(parsedInfo.tokenAmount) ? parsedInfo.tokenAmount : null;
  const decimalsValue = tokenAmount?.decimals;
  return {
    ownerAddress: parsedInfo.owner as string,
    mintAddress: parsedInfo.mint as string,
    tokenAmountUi: parseTokenAmountUi(tokenAmount),
    decimals: typeof decimalsValue === "number" ? decimalsValue : null,
  };
};

const sumParsedTokenAccountsUi = (accounts: unknown[]): number =>
  accounts.reduce<number>((total, entry) => {
    if (!isRecord(entry) || !isRecord(entry.account)) {
      return total;
    }
    const accountData = entry.account;
    if (!isRecord(accountData.data) || !isRecord(accountData.data.parsed) || !isRecord(accountData.data.parsed.info)) {
      return total;
    }
    return total + parseTokenAmountUi(accountData.data.parsed.info.tokenAmount);
  }, 0);

const stringifySummary = (value: unknown): string => JSON.stringify(value, null, 2);

const sanitizeRpcUrl = (value: string): string => {
  const parsed = new URL(value);
  parsed.search = "";
  return parsed.toString();
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[manual-rpc-reads] falling back to public RPC: ${message}`);
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
    const result = await getRpcTokenLargestAccountsAction.execute(ctx, {
      mintAddress,
      limit: 1,
    });
    if (result.ok) {
      return { mintAddress, source: "auto-probed" };
    }
  }

  throw new Error("Unable to find a live test mint that supports getRpcTokenLargestAccounts on the selected RPC.");
};

const main = async (): Promise<void> => {
  const resolvedRpc = await resolveManualSmokeRpcUrl();
  const rpcUrl = resolvedRpc.rpcUrl;
  const ctx = createActionContext({
    actor: "agent",
    rpcUrl,
  });
  const resolvedMint = await resolveManualSmokeMint(ctx);
  const testMint = resolvedMint.mintAddress;

  console.log(`[manual-rpc-reads] rpcUrl=${sanitizeRpcUrl(rpcUrl)}`);
  console.log(`[manual-rpc-reads] rpcSource=${resolvedRpc.source}`);
  console.log(`[manual-rpc-reads] mint=${testMint}`);
  console.log(`[manual-rpc-reads] mintSource=${resolvedMint.source}`);

  const supply = await executeActionWithRetries("getRpcTokenSupply", async () =>
    await getRpcTokenSupplyAction.execute(ctx, {
      mintAddress: testMint,
    }),
  ) as {
    mintAddress: string;
    contextSlot: string;
    amountRaw: string;
    decimals: number;
    uiAmountString: string | null;
  };

  assert.equal(supply.mintAddress, testMint);
  assert.ok(/^\d+$/u.test(supply.amountRaw), "expected raw token supply amount");
  assert.ok(Number.isInteger(supply.decimals) && supply.decimals >= 0, "expected token decimals");

  const largestAccounts = await executeActionWithRetries(
    "getRpcTokenLargestAccounts",
    async () => await getRpcTokenLargestAccountsAction.execute(ctx, {
      mintAddress: testMint,
      limit: 3,
    }),
  ) as {
    mintAddress: string;
    contextSlot: string;
    returned: number;
    accounts: Array<{
      address: string;
      amountRaw: string;
      decimals: number | null;
      uiAmountString: string | null;
    }>;
  };

  assert.ok(largestAccounts.returned > 0, "expected at least one token holder account");
  const largestAccount = largestAccounts.accounts[0];
  assert.ok(largestAccount, "expected first token holder account");
  assert.equal(largestAccount.decimals, supply.decimals, "largest holder decimals should match mint decimals");

  const parsedTokenAccountInfoResult = await executeActionWithRetries(
    "getRpcAccountInfo(jsonParsed)",
    async () => await getRpcAccountInfoAction.execute(ctx, {
      account: largestAccount.address,
      encoding: "jsonParsed",
    }),
  );
  const parsedTokenAccountInfo = parseParsedTokenAccountInfo(parsedTokenAccountInfoResult);
  assert.equal(parsedTokenAccountInfo.mintAddress, testMint, "parsed token account mint should match test mint");
  assert.equal(parsedTokenAccountInfo.decimals, supply.decimals, "parsed token account decimals should match supply");

  const tokenOwnerAddress = parsedTokenAccountInfo.ownerAddress;

  const ownerBalance = await executeActionWithRetries(
    "getRpcBalance",
    async () => await getRpcBalanceAction.execute(ctx, {
      account: tokenOwnerAddress,
    }),
  ) as {
    account: string;
    contextSlot: string;
    lamports: string;
    sol: number;
  };

  assert.equal(ownerBalance.account, tokenOwnerAddress);
  assert.ok(/^\d+$/u.test(ownerBalance.lamports), "expected owner lamports as string");

  const base64MintInfo = await executeActionWithRetries(
    "getRpcAccountInfo(base64)",
    async () => await getRpcAccountInfoAction.execute(ctx, {
      account: testMint,
      encoding: "base64",
      dataSlice: { offset: 0, length: 32 },
    }),
  ) as {
    account: string;
    encoding: "base64";
    contextSlot: string;
    accountInfo: unknown;
  };

  assert.equal(base64MintInfo.account, testMint);
  assert.equal(base64MintInfo.encoding, "base64");
  assert.ok(base64MintInfo.accountInfo !== null, "expected base64 mint account info");

  const multipleAccounts = await executeActionWithRetries(
    "getRpcMultipleAccounts",
    async () => await getRpcMultipleAccountsAction.execute(ctx, {
      accounts: [testMint, largestAccount.address, tokenOwnerAddress],
      encoding: "jsonParsed",
    }),
  ) as {
    requested: number;
    returned: number;
    contextSlot: string;
    accounts: Array<{ address: string; account: unknown | null }>;
  };

  assert.equal(multipleAccounts.requested, 3);
  assert.equal(multipleAccounts.returned, 3);
  assert.equal(multipleAccounts.accounts.length, 3);
  assert.ok(multipleAccounts.accounts.every((entry) => entry.account !== null), "expected populated multiple account results");

  const tokenAccountsByOwner = await executeActionWithRetries(
    "getRpcTokenAccountsByOwner",
    async () => await getRpcTokenAccountsByOwnerAction.execute(ctx, {
      ownerAddress: tokenOwnerAddress,
      mintAddress: testMint,
      encoding: "jsonParsed",
    }),
  ) as {
    ownerAddress: string;
    filter: { mintAddress?: string; programId?: string | null };
    encoding: "jsonParsed";
    contextSlot: string;
    returned: number;
    accounts: unknown[];
  };

  assert.equal(tokenAccountsByOwner.ownerAddress, tokenOwnerAddress);
  assert.equal(tokenAccountsByOwner.filter.mintAddress, testMint);
  assert.ok(tokenAccountsByOwner.returned > 0, "expected token accounts for discovered owner");
  const tokenAccountsUiTotal = sumParsedTokenAccountsUi(tokenAccountsByOwner.accounts);
  assert.ok(tokenAccountsUiTotal >= parsedTokenAccountInfo.tokenAmountUi, "owner aggregate token balance should include sampled account");

  const signatures = await executeActionWithRetries(
    "getRpcSignaturesForAddress",
    async () => await getRpcSignaturesForAddressAction.execute(ctx, {
      account: tokenOwnerAddress,
      limit: 5,
    }),
  ) as {
    account: string;
    returned: number;
    signatures: Array<{
      signature: string;
      slot: string;
      error: unknown | null;
      memo: string | null;
      blockTime: number | null;
      confirmationStatus: string | null;
    }>;
  };

  assert.ok(signatures.returned > 0, "expected recent signatures for discovered owner");
  const firstSignature = signatures.signatures[0]?.signature;
  assert.ok(firstSignature, "expected at least one signature");

  const transaction = await executeActionWithRetries(
    "getRpcTransaction",
    async () => await getRpcTransactionAction.execute(ctx, {
      signature: firstSignature,
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
    }),
  ) as {
    signature: string;
    encoding: "jsonParsed";
    slot: string | null;
    blockTime: number | null;
    version: unknown;
    meta: unknown | null;
    transaction: unknown | null;
  };

  assert.equal(transaction.signature, firstSignature);
  assert.ok(transaction.transaction !== null, "expected parsed transaction payload");
  assert.ok(transaction.meta !== null, "expected parsed transaction meta");

  const tokenAccountAdapter = createTokenAccountAdapter({ rpcUrl });
  const [adapterSolBalance, adapterTokenBalance, adapterHasTokenAccount, adapterDecimals] = await Promise.all([
    tokenAccountAdapter.getSolBalance(tokenOwnerAddress),
    tokenAccountAdapter.getTokenBalance(tokenOwnerAddress, testMint),
    tokenAccountAdapter.hasTokenAccount(tokenOwnerAddress, testMint),
    tokenAccountAdapter.getDecimals(testMint),
  ]);

  assert.ok(Number.isFinite(adapterSolBalance) && adapterSolBalance >= 0, "expected usable SOL balance");
  assert.ok(Number.isFinite(adapterTokenBalance) && adapterTokenBalance >= 0, "expected usable token balance");
  assert.equal(adapterHasTokenAccount, true, "expected discovered owner to have token account");
  assert.equal(adapterDecimals, supply.decimals, "adapter decimals should match token supply decimals");
  assert.ok(
    Math.abs(adapterTokenBalance - tokenAccountsUiTotal) < 0.000001,
    `adapter token balance ${adapterTokenBalance} did not match parsed RPC total ${tokenAccountsUiTotal}`,
  );

  console.log("[manual-rpc-reads] OK");
  console.log(stringifySummary({
    rpcUrl: sanitizeRpcUrl(rpcUrl),
    rpcSource: resolvedRpc.source,
    mintAddress: testMint,
    mintSource: resolvedMint.source,
    discoveredOwnerAddress: tokenOwnerAddress,
    sampledTokenAccountAddress: largestAccount.address,
    supply: {
      contextSlot: supply.contextSlot,
      amountRaw: supply.amountRaw,
      decimals: supply.decimals,
      uiAmountString: supply.uiAmountString,
    },
    largestAccount: {
      amountRaw: largestAccount.amountRaw,
      decimals: largestAccount.decimals,
      uiAmountString: largestAccount.uiAmountString,
    },
    parsedTokenAccount: parsedTokenAccountInfo,
    ownerBalance,
    tokenAccountsByOwner: {
      returned: tokenAccountsByOwner.returned,
      aggregateUiAmount: tokenAccountsUiTotal,
    },
    signatures: {
      returned: signatures.returned,
      first: signatures.signatures[0],
    },
    transaction: {
      slot: transaction.slot,
      blockTime: transaction.blockTime,
      version: transaction.version,
      hasMeta: transaction.meta !== null,
      hasTransaction: transaction.transaction !== null,
    },
    tokenAccountAdapter: {
      solBalance: adapterSolBalance,
      tokenBalance: adapterTokenBalance,
      hasTokenAccount: adapterHasTokenAccount,
      decimals: adapterDecimals,
    },
  }));
};

await main();
