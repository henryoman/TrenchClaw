import {
  createDefaultRpcTransport,
  createSolanaRpc,
  createSolanaRpcFromTransport,
} from "@solana/kit";

import { isHeliusRpcUrl } from "./helius";

const DEFAULT_HELIUS_RPC_MIN_INTERVAL_MS = 250;
const HELIUS_RPC_MIN_INTERVAL_ENV = "TRENCHCLAW_HELIUS_RPC_MIN_INTERVAL_MS";

interface RpcRateLimitState {
  nextStartAtMs: number;
  tail: Promise<void>;
}

const rpcRateLimitStates = new Map<string, RpcRateLimitState>();

const sleep = async (delayMs: number): Promise<void> => {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const resolveHeliusRpcMinIntervalMs = (): number => {
  const configured = process.env[HELIUS_RPC_MIN_INTERVAL_ENV]?.trim();
  if (!configured) {
    return DEFAULT_HELIUS_RPC_MIN_INTERVAL_MS;
  }

  const parsed = Number.parseInt(configured, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HELIUS_RPC_MIN_INTERVAL_MS;
};

const resolveRpcRateLimit = (rpcUrl: string): { key: string; minIntervalMs: number } | null => {
  const trimmedUrl = rpcUrl.trim();
  if (!isHeliusRpcUrl(trimmedUrl)) {
    return null;
  }

  try {
    const normalized = new URL(trimmedUrl);
    normalized.hash = "";
    return {
      key: normalized.toString(),
      minIntervalMs: resolveHeliusRpcMinIntervalMs(),
    };
  } catch {
    return {
      key: trimmedUrl,
      minIntervalMs: resolveHeliusRpcMinIntervalMs(),
    };
  }
};

const reserveRpcStartSlot = async (key: string, minIntervalMs: number): Promise<void> => {
  const currentState = rpcRateLimitStates.get(key) ?? {
    nextStartAtMs: 0,
    tail: Promise.resolve(),
  };
  rpcRateLimitStates.set(key, currentState);

  const previousTail = currentState.tail;
  let release!: () => void;
  currentState.tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previousTail;

  const now = Date.now();
  const scheduledStartAtMs = Math.max(now, currentState.nextStartAtMs);
  currentState.nextStartAtMs = scheduledStartAtMs + minIntervalMs;
  release();

  await sleep(scheduledStartAtMs - now);
};

export const scheduleRateLimitedRpcRequest = async <T>(
  rpcUrl: string,
  operation: () => Promise<T>,
): Promise<T> => {
  const rateLimit = resolveRpcRateLimit(rpcUrl);
  if (rateLimit) {
    await reserveRpcStartSlot(rateLimit.key, rateLimit.minIntervalMs);
  }

  return await operation();
};

export const createRateLimitedSolanaRpc = (
  rpcUrl: Parameters<typeof createSolanaRpc>[0],
  config?: Parameters<typeof createSolanaRpc>[1],
) => {
  const baseTransport = createDefaultRpcTransport({
    url: rpcUrl,
    ...config,
  });
  const rateLimitedTransport = (async (...args: Parameters<typeof baseTransport>) =>
    await scheduleRateLimitedRpcRequest(rpcUrl, async () => await baseTransport(...args))) as typeof baseTransport;

  return createSolanaRpcFromTransport(rateLimitedTransport);
};

export const resetRpcRateLimitStateForTests = (): void => {
  rpcRateLimitStates.clear();
};
