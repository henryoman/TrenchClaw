import { parseRetryAfterMs } from "../../../lib/rpc/client";

const GECKOTERMINAL_API_BASE_URL = "https://api.geckoterminal.com/api/v2";
const GECKOTERMINAL_SOLANA_NETWORK = "solana";
const GECKOTERMINAL_ACCEPT_HEADER = "application/json;version=20230203";
const GECKOTERMINAL_REQUEST_TIMEOUT_MS = 15_000;
const GECKOTERMINAL_MAX_RETRIES = 2;
const GECKOTERMINAL_RETRY_BACKOFF_MS = 1_000;
const GECKOTERMINAL_RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const GECKOTERMINAL_DEFAULT_MIN_INTERVAL_MS = 6_500;
const GECKOTERMINAL_DEFAULT_CACHE_TTL_MS = 60_000;
const GECKOTERMINAL_DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000;
const GECKOTERMINAL_MIN_INTERVAL_ENV = "TRENCHCLAW_GECKOTERMINAL_MIN_INTERVAL_MS";
const GECKOTERMINAL_CACHE_TTL_ENV = "TRENCHCLAW_GECKOTERMINAL_CACHE_TTL_MS";
const GECKOTERMINAL_RATE_LIMIT_COOLDOWN_ENV = "TRENCHCLAW_GECKOTERMINAL_RATE_LIMIT_COOLDOWN_MS";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface GeckoTerminalRequestOptions {
  signal?: AbortSignal;
}

interface GeckoTerminalRequestErrorOptions {
  retryable: boolean;
  status?: number;
  cause?: unknown;
}

export interface GeckoTerminalPoolOhlcvRequest {
  poolAddress: string;
  timeframe: "minute" | "hour" | "day";
  aggregate?: number;
  beforeTimestamp?: number;
  limit?: number;
  currency?: "usd" | "token";
  includeEmptyIntervals?: boolean;
  token?: string;
  options?: GeckoTerminalRequestOptions;
}

export interface GeckoTerminalPoolOhlcvResponse {
  requestUrl: string;
  payload: JsonObject;
}

export interface GeckoTerminalTokenPoolsRequest {
  tokenAddress: string;
  include?: Array<"base_token" | "quote_token" | "dex">;
  includeInactiveSource?: boolean;
  page?: number;
  sort?: "h24_volume_usd_desc" | "h24_tx_count_desc" | "h24_volume_usd_liquidity_desc";
  options?: GeckoTerminalRequestOptions;
}

export interface GeckoTerminalTokenPoolsResponse {
  requestUrl: string;
  payload: JsonObject;
}

interface GeckoTerminalRateLimitState {
  nextStartAtMs: number;
  tail: Promise<void>;
}

interface CachedGeckoTerminalResponse {
  payload: JsonObject;
  expiresAtMs: number;
}

const geckoTerminalRateLimitState: GeckoTerminalRateLimitState = {
  nextStartAtMs: 0,
  tail: Promise.resolve(),
};

const geckoTerminalResponseCache = new Map<string, CachedGeckoTerminalResponse>();
const geckoTerminalInFlightRequests = new Map<string, Promise<JsonObject>>();

class GeckoTerminalRequestError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(message: string, options: GeckoTerminalRequestErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "GeckoTerminalRequestError";
    this.retryable = options.retryable;
    this.status = options.status ?? null;
  }
}

const assertNonEmptyParam = (name: string, value: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`GeckoTerminal invocation error: "${name}" cannot be empty.`);
  }
  return normalized;
};

const resolveEnvBackedMs = (envKey: string, fallback: number): number => {
  const configured = process.env[envKey]?.trim();
  if (!configured) {
    return fallback;
  }

  const parsed = Number.parseInt(configured, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const resolveGeckoTerminalMinIntervalMs = (): number =>
  resolveEnvBackedMs(GECKOTERMINAL_MIN_INTERVAL_ENV, GECKOTERMINAL_DEFAULT_MIN_INTERVAL_MS);

const resolveGeckoTerminalCacheTtlMs = (): number =>
  resolveEnvBackedMs(GECKOTERMINAL_CACHE_TTL_ENV, GECKOTERMINAL_DEFAULT_CACHE_TTL_MS);

const resolveGeckoTerminalRateLimitCooldownMs = (): number =>
  resolveEnvBackedMs(GECKOTERMINAL_RATE_LIMIT_COOLDOWN_ENV, GECKOTERMINAL_DEFAULT_RATE_LIMIT_COOLDOWN_MS);

const isJsonObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const getRequestSignal = (requestOptions: GeckoTerminalRequestOptions): AbortSignal => {
  const timeoutSignal = AbortSignal.timeout(GECKOTERMINAL_REQUEST_TIMEOUT_MS);
  return requestOptions.signal ? AbortSignal.any([requestOptions.signal, timeoutSignal]) : timeoutSignal;
};

const isCallerAbort = (requestOptions: GeckoTerminalRequestOptions): boolean =>
  requestOptions.signal?.aborted === true;

const sleep = async (delayMs: number): Promise<void> => {
  if (delayMs <= 0) {
    return;
  }

  await Bun.sleep(delayMs);
};

const normalizeGeckoTerminalCacheKey = (url: string): string => {
  try {
    const normalized = new URL(url.trim());
    normalized.hash = "";
    return normalized.toString();
  } catch {
    return url.trim();
  }
};

const readCachedGeckoTerminalResponse = (url: string): JsonObject | null => {
  const key = normalizeGeckoTerminalCacheKey(url);
  const cached = geckoTerminalResponseCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAtMs <= Date.now()) {
    geckoTerminalResponseCache.delete(key);
    return null;
  }
  return cached.payload;
};

const writeCachedGeckoTerminalResponse = (url: string, payload: JsonObject): void => {
  const ttlMs = resolveGeckoTerminalCacheTtlMs();
  if (ttlMs <= 0) {
    return;
  }
  geckoTerminalResponseCache.set(normalizeGeckoTerminalCacheKey(url), {
    payload,
    expiresAtMs: Date.now() + ttlMs,
  });
};

const applyGeckoTerminalCooldown = (cooldownMs: number): void => {
  const minIntervalMs = resolveGeckoTerminalMinIntervalMs();
  geckoTerminalRateLimitState.nextStartAtMs = Math.max(
    geckoTerminalRateLimitState.nextStartAtMs,
    Date.now() + Math.max(cooldownMs, minIntervalMs),
  );
};

const scheduleRateLimitedGeckoTerminalRequest = async <T>(operation: () => Promise<T>): Promise<T> => {
  const previousTail = geckoTerminalRateLimitState.tail;
  let release!: () => void;
  geckoTerminalRateLimitState.tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previousTail;

  try {
    const now = Date.now();
    const minIntervalMs = resolveGeckoTerminalMinIntervalMs();
    const scheduledStartAtMs = Math.max(now, geckoTerminalRateLimitState.nextStartAtMs);
    geckoTerminalRateLimitState.nextStartAtMs = Math.max(
      geckoTerminalRateLimitState.nextStartAtMs,
      scheduledStartAtMs + minIntervalMs,
    );
    await sleep(scheduledStartAtMs - now);
    return await operation();
  } finally {
    release();
  }
};

const toGeckoTerminalRequestError = (input: {
  error: unknown;
  url: string;
  requestOptions: GeckoTerminalRequestOptions;
}): GeckoTerminalRequestError => {
  if (input.error instanceof GeckoTerminalRequestError) {
    return input.error;
  }

  if (isCallerAbort(input.requestOptions)) {
    return new GeckoTerminalRequestError(`GeckoTerminal request was aborted for ${input.url}`, {
      retryable: false,
      cause: input.error,
    });
  }

  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const normalized = message.toLowerCase();
  const timedOut = normalized.includes("timed out") || normalized.includes("timeout") || normalized.includes("abort");

  return new GeckoTerminalRequestError(
    timedOut
      ? `GeckoTerminal request timed out after ${GECKOTERMINAL_REQUEST_TIMEOUT_MS}ms for ${input.url}`
      : `GeckoTerminal request failed for ${input.url}: ${message}`,
    {
      retryable: true,
      cause: input.error,
    },
  );
};

const shouldRetryError = (
  error: GeckoTerminalRequestError,
  requestOptions: GeckoTerminalRequestOptions,
  attempt: number,
): boolean =>
  error.retryable && attempt < GECKOTERMINAL_MAX_RETRIES && !requestOptions.signal?.aborted;

const getRetryDelayMs = (response: Response, attempt: number): number => {
  return Math.max(
    parseRetryAfterMs(response.headers.get("retry-after")) ?? 0,
    GECKOTERMINAL_RETRY_BACKOFF_MS * (attempt + 1),
  );
};

const assertJsonObjectResponse = (payload: unknown, url: string): JsonObject => {
  if (!isJsonObject(payload)) {
    throw new GeckoTerminalRequestError(
      `GeckoTerminal returned an invalid response shape for ${url}: expected a JSON object.`,
      { retryable: false },
    );
  }
  return payload;
};

async function fetchGeckoTerminalJsonUncached(
  url: string,
  requestOptions: GeckoTerminalRequestOptions = {},
  attempt = 0,
): Promise<JsonObject> {
  try {
    return await scheduleRateLimitedGeckoTerminalRequest(async () => {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: GECKOTERMINAL_ACCEPT_HEADER,
        },
        signal: getRequestSignal(requestOptions),
      });

      if (!response.ok) {
        const error = new GeckoTerminalRequestError(
          `GeckoTerminal request failed (${response.status} ${response.statusText}) for ${url}`,
          {
            retryable: GECKOTERMINAL_RETRYABLE_STATUS_CODES.has(response.status),
            status: response.status,
          },
        );
        if (response.status === 429) {
          applyGeckoTerminalCooldown(
            Math.max(getRetryDelayMs(response, attempt), resolveGeckoTerminalRateLimitCooldownMs()),
          );
        }
        if (shouldRetryError(error, requestOptions, attempt)) {
          if (response.status !== 429) {
            applyGeckoTerminalCooldown(getRetryDelayMs(response, attempt));
          }
          throw error;
        }
        throw error;
      }

      try {
        const payload = assertJsonObjectResponse(await response.json(), url);
        writeCachedGeckoTerminalResponse(url, payload);
        return payload;
      } catch (error) {
        throw new GeckoTerminalRequestError(`GeckoTerminal returned invalid JSON for ${url}`, {
          retryable: false,
          cause: error,
        });
      }
    });
  } catch (error) {
    if (error instanceof GeckoTerminalRequestError && shouldRetryError(error, requestOptions, attempt)) {
      return fetchGeckoTerminalJsonUncached(url, requestOptions, attempt + 1);
    }
    const requestError = toGeckoTerminalRequestError({
      error,
      url,
      requestOptions,
    });
    if (shouldRetryError(requestError, requestOptions, attempt)) {
      applyGeckoTerminalCooldown(GECKOTERMINAL_RETRY_BACKOFF_MS * (attempt + 1));
      return fetchGeckoTerminalJsonUncached(url, requestOptions, attempt + 1);
    }
    throw requestError;
  }
}

async function fetchGeckoTerminalJson(
  url: string,
  requestOptions: GeckoTerminalRequestOptions = {},
): Promise<JsonObject> {
  const cached = readCachedGeckoTerminalResponse(url);
  if (cached) {
    return cached;
  }

  const cacheKey = normalizeGeckoTerminalCacheKey(url);
  const inFlight = geckoTerminalInFlightRequests.get(cacheKey);
  if (inFlight) {
    return await inFlight;
  }

  const requestPromise = fetchGeckoTerminalJsonUncached(url, requestOptions)
    .finally(() => {
      geckoTerminalInFlightRequests.delete(cacheKey);
    });
  geckoTerminalInFlightRequests.set(cacheKey, requestPromise);
  return await requestPromise;
}

const buildOhlcvUrl = (input: GeckoTerminalPoolOhlcvRequest): string => {
  const poolAddress = assertNonEmptyParam("poolAddress", input.poolAddress);
  const searchParams = new URLSearchParams();

  if (typeof input.aggregate === "number") {
    searchParams.set("aggregate", String(input.aggregate));
  }
  if (typeof input.beforeTimestamp === "number") {
    searchParams.set("before_timestamp", String(input.beforeTimestamp));
  }
  if (typeof input.limit === "number") {
    searchParams.set("limit", String(input.limit));
  }
  if (input.currency) {
    searchParams.set("currency", input.currency);
  }
  if (typeof input.includeEmptyIntervals === "boolean") {
    searchParams.set("include_empty_intervals", String(input.includeEmptyIntervals));
  }
  if (input.token) {
    searchParams.set("token", assertNonEmptyParam("token", input.token));
  }

  const query = searchParams.toString();
  const path = `/networks/${GECKOTERMINAL_SOLANA_NETWORK}/pools/${encodeURIComponent(poolAddress)}/ohlcv/${input.timeframe}`;
  return `${GECKOTERMINAL_API_BASE_URL}${path}${query ? `?${query}` : ""}`;
};

const buildTokenPoolsUrl = (input: GeckoTerminalTokenPoolsRequest): string => {
  const tokenAddress = assertNonEmptyParam("tokenAddress", input.tokenAddress);
  const searchParams = new URLSearchParams();
  const include = input.include?.filter(Boolean) ?? [];
  if (include.length > 0) {
    searchParams.set("include", include.join(","));
  }
  if (typeof input.includeInactiveSource === "boolean") {
    searchParams.set("include_inactive_source", String(input.includeInactiveSource));
  }
  if (typeof input.page === "number" && Number.isFinite(input.page) && input.page > 0) {
    searchParams.set("page", String(Math.trunc(input.page)));
  }
  if (input.sort) {
    searchParams.set("sort", input.sort);
  }

  const query = searchParams.toString();
  const path = `/networks/${GECKOTERMINAL_SOLANA_NETWORK}/tokens/${encodeURIComponent(tokenAddress)}/pools`;
  return `${GECKOTERMINAL_API_BASE_URL}${path}${query ? `?${query}` : ""}`;
};

export async function getGeckoTerminalPoolOhlcv(
  input: GeckoTerminalPoolOhlcvRequest,
): Promise<GeckoTerminalPoolOhlcvResponse> {
  const requestUrl = buildOhlcvUrl(input);
  const payload = await fetchGeckoTerminalJson(requestUrl, input.options);
  return {
    requestUrl,
    payload,
  };
}

export async function getGeckoTerminalTokenPools(
  input: GeckoTerminalTokenPoolsRequest,
): Promise<GeckoTerminalTokenPoolsResponse> {
  const requestUrl = buildTokenPoolsUrl(input);
  const payload = await fetchGeckoTerminalJson(requestUrl, input.options);
  return {
    requestUrl,
    payload,
  };
}

export function isGeckoTerminalRetryableError(error: unknown): boolean {
  return error instanceof GeckoTerminalRequestError && error.retryable;
}

export const resetGeckoTerminalRateLimitStateForTests = (): void => {
  geckoTerminalRateLimitState.nextStartAtMs = 0;
  geckoTerminalRateLimitState.tail = Promise.resolve();
  geckoTerminalResponseCache.clear();
  geckoTerminalInFlightRequests.clear();
};
