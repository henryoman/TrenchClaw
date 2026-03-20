import {
  createDefaultRpcTransport,
  createSolanaRpc,
  createSolanaRpcFromTransport,
} from "@solana/kit";

import { isHeliusRpcUrl } from "./helius";

const DEFAULT_HELIUS_RPC_MIN_INTERVAL_MS = 250;
const DEFAULT_HELIUS_DAS_MIN_INTERVAL_MS = 400;
const DEFAULT_BACKGROUND_LANE_EXTRA_DELAY_MS = 150;
const HELIUS_RPC_MIN_INTERVAL_ENV = "TRENCHCLAW_HELIUS_RPC_MIN_INTERVAL_MS";
const HELIUS_DAS_MIN_INTERVAL_ENV = "TRENCHCLAW_HELIUS_DAS_MIN_INTERVAL_MS";

interface RpcRateLimitState {
  nextStartAtMs: number;
  tail: Promise<void>;
}

const rpcRateLimitStates = new Map<string, RpcRateLimitState>();

export type RpcRequestLane = "inline" | "background";
export type RpcProviderKind = "helius-rpc" | "helius-das" | "solana-rpc";

export interface RpcRequestSchedulingOptions {
  providerHint?: RpcProviderKind;
  methodFamily?: string;
  lane?: RpcRequestLane;
}

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

const resolveHeliusDasMinIntervalMs = (): number => {
  const configured = process.env[HELIUS_DAS_MIN_INTERVAL_ENV]?.trim();
  if (!configured) {
    return DEFAULT_HELIUS_DAS_MIN_INTERVAL_MS;
  }

  const parsed = Number.parseInt(configured, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HELIUS_DAS_MIN_INTERVAL_MS;
};

const normalizeRpcCoordinatorUrlKey = (rpcUrl: string): string => {
  const trimmedUrl = rpcUrl.trim();
  try {
    const normalized = new URL(trimmedUrl);
    normalized.hash = "";
    return normalized.toString();
  } catch {
    return trimmedUrl;
  }
};

const resolveRpcSchedulingDescriptor = (
  rpcUrl: string,
  options: RpcRequestSchedulingOptions = {},
): { key: string; minIntervalMs: number } | null => {
  const trimmedUrl = rpcUrl.trim();
  if (!trimmedUrl) {
    return null;
  }

  const providerKind =
    options.providerHint
    ?? (isHeliusRpcUrl(trimmedUrl) ? "helius-rpc" : "solana-rpc");
  const lane = options.lane ?? "inline";
  const methodFamily = options.methodFamily?.trim() || "generic";
  const baseMinIntervalMs =
    providerKind === "helius-das"
      ? resolveHeliusDasMinIntervalMs()
      : providerKind === "helius-rpc"
        ? resolveHeliusRpcMinIntervalMs()
        : 0;
  const minIntervalMs =
    baseMinIntervalMs + (lane === "background" ? DEFAULT_BACKGROUND_LANE_EXTRA_DELAY_MS : 0);

  return {
    key: `${providerKind}:${methodFamily}:${normalizeRpcCoordinatorUrlKey(trimmedUrl)}`,
    minIntervalMs,
  };
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

const getOrCreateRateLimitState = (key: string): RpcRateLimitState => {
  const existing = rpcRateLimitStates.get(key);
  if (existing) {
    return existing;
  }
  const created: RpcRateLimitState = {
    nextStartAtMs: 0,
    tail: Promise.resolve(),
  };
  rpcRateLimitStates.set(key, created);
  return created;
};

export const applyRpcRateLimitCooldown = (
  rpcUrl: string,
  cooldownMs: number,
  options: RpcRequestSchedulingOptions = {},
): void => {
  const rateLimit = resolveRpcSchedulingDescriptor(rpcUrl, options);
  if (rateLimit) {
    const state = getOrCreateRateLimitState(rateLimit.key);
    state.nextStartAtMs = Math.max(state.nextStartAtMs, Date.now() + Math.max(cooldownMs, rateLimit.minIntervalMs));
  }
};

export const parseRetryAfterMs = (value: string | null | undefined): number | null => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const retryAfterSeconds = Number(trimmed);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.round(retryAfterSeconds * 1000);
  }

  const retryAfterDate = Date.parse(trimmed);
  if (Number.isFinite(retryAfterDate)) {
    return Math.max(0, retryAfterDate - Date.now());
  }

  return null;
};

export const scheduleRateLimitedRpcRequest = async <T>(
  rpcUrl: string,
  operation: () => Promise<T>,
  options: RpcRequestSchedulingOptions = {},
): Promise<T> => {
  const rateLimit = resolveRpcSchedulingDescriptor(rpcUrl, options);
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
    await scheduleRateLimitedRpcRequest(
      rpcUrl,
      async () => await baseTransport(...args),
      {
        providerHint: isHeliusRpcUrl(rpcUrl) ? "helius-rpc" : "solana-rpc",
        methodFamily: "transport",
        lane: "inline",
      },
    )) as typeof baseTransport;

  return createSolanaRpcFromTransport(rateLimitedTransport);
};

export const resetRpcRateLimitStateForTests = (): void => {
  rpcRateLimitStates.clear();
};
