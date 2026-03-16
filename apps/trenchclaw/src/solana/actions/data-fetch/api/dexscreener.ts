const DEXSCREENER_API_BASE_URL = "https://api.dexscreener.com";
const MAX_TOKEN_ADDRESSES_PER_REQUEST = 30;
const DEXSCREENER_SOLANA_CHAIN_ID = "solana";
const DEXSCREENER_MAX_RETRIES = 2;
const DEXSCREENER_RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const DEXSCREENER_RETRY_BACKOFF_MS = 750;
const DEXSCREENER_REQUEST_TIMEOUT_MS = 10_000;

export interface DexscreenerRequestOptions {
  signal?: AbortSignal;
}

interface DexscreenerRequestErrorOptions {
  retryable: boolean;
  status?: number;
  cause?: unknown;
}

interface DexscreenerInvokeBase {
  options?: DexscreenerRequestOptions;
}

export interface DexscreenerInvokeWithTokenAddress extends DexscreenerInvokeBase {
  tokenAddress: string;
}

export interface DexscreenerInvokeWithPairAddress extends DexscreenerInvokeBase {
  pairAddress: string;
}

export interface DexscreenerInvokeSearchPairs extends DexscreenerInvokeBase {
  query: string;
}

export interface DexscreenerInvokeTokens extends DexscreenerInvokeBase {
  tokenAddresses: string[];
}

class DexscreenerRequestError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(message: string, options: DexscreenerRequestErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "DexscreenerRequestError";
    this.retryable = options.retryable;
    this.status = options.status ?? null;
  }
}

function assertNonEmptyParam(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Dexscreener invocation error: "${name}" cannot be empty.`);
  }

  return normalized;
}

function assertTokenAddresses(tokenAddresses: string[]): string[] {
  const normalized = [...new Set(tokenAddresses.map((item) => item.trim()).filter(Boolean))];

  if (normalized.length === 0) {
    throw new Error('Dexscreener invocation error: "tokenAddresses" must include at least one address.');
  }

  if (normalized.length > MAX_TOKEN_ADDRESSES_PER_REQUEST) {
    throw new Error(
      `Dexscreener invocation error: "tokenAddresses" supports up to ${MAX_TOKEN_ADDRESSES_PER_REQUEST} addresses per request.`,
    );
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getDexscreenerRequestSignal(requestOptions: DexscreenerRequestOptions): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(DEXSCREENER_REQUEST_TIMEOUT_MS);
  return requestOptions.signal ? AbortSignal.any([requestOptions.signal, timeoutSignal]) : timeoutSignal;
}

function isCallerAbort(requestOptions: DexscreenerRequestOptions): boolean {
  return requestOptions.signal?.aborted === true;
}

function toDexscreenerRequestError(input: {
  error: unknown;
  path: string;
  requestOptions: DexscreenerRequestOptions;
}): DexscreenerRequestError {
  if (input.error instanceof DexscreenerRequestError) {
    return input.error;
  }

  if (isCallerAbort(input.requestOptions)) {
    return new DexscreenerRequestError(`Dexscreener request was aborted for ${input.path}`, {
      retryable: false,
      cause: input.error,
    });
  }

  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const normalized = message.toLowerCase();
  const timedOut = normalized.includes("timed out") || normalized.includes("timeout") || normalized.includes("abort");

  return new DexscreenerRequestError(
    timedOut
      ? `Dexscreener request timed out after ${DEXSCREENER_REQUEST_TIMEOUT_MS}ms for ${input.path}`
      : `Dexscreener request failed for ${input.path}: ${message}`,
    {
      retryable: true,
      cause: input.error,
    },
  );
}

function shouldRetryDexscreenerError(
  error: DexscreenerRequestError,
  requestOptions: DexscreenerRequestOptions,
  attempt: number,
): boolean {
  return error.retryable && attempt < DEXSCREENER_MAX_RETRIES && !requestOptions.signal?.aborted;
}

function assertDexscreenerArrayResponse<T>(payload: unknown, path: string): T[] {
  if (!Array.isArray(payload)) {
    throw new DexscreenerRequestError(`Dexscreener returned an invalid response shape for ${path}: expected an array.`, {
      retryable: false,
    });
  }

  return payload as T[];
}

function assertDexscreenerPairsResponse(payload: unknown, path: string): DexscreenerPairsResponse {
  if (!isRecord(payload)) {
    throw new DexscreenerRequestError(`Dexscreener returned an invalid response shape for ${path}: expected an object.`, {
      retryable: false,
    });
  }

  return {
    schemaVersion: typeof payload.schemaVersion === "string" ? payload.schemaVersion : undefined,
    pairs: Array.isArray(payload.pairs) ? (payload.pairs as DexscreenerPairInfo[]) : [],
  };
}

function assertDexscreenerPairListResponse(payload: unknown, path: string): DexscreenerPairInfo[] {
  if (Array.isArray(payload)) {
    return payload as DexscreenerPairInfo[];
  }

  if (isRecord(payload) && Array.isArray(payload.pairs)) {
    return payload.pairs as DexscreenerPairInfo[];
  }

  throw new DexscreenerRequestError(`Dexscreener returned an invalid response shape for ${path}: expected an array or pairs object.`, {
    retryable: false,
  });
}

function assertDexscreenerPairResponse(payload: unknown, path: string): DexscreenerPairResponse {
  if (!isRecord(payload)) {
    throw new DexscreenerRequestError(`Dexscreener returned an invalid response shape for ${path}: expected an object.`, {
      retryable: false,
    });
  }

  return {
    schemaVersion: typeof payload.schemaVersion === "string" ? payload.schemaVersion : undefined,
    pair: isRecord(payload.pair) ? (payload.pair as unknown as DexscreenerPairInfo) : null,
  };
}

function assertDexscreenerOrdersResponse(payload: unknown, path: string): DexscreenerOrdersResponse {
  if (Array.isArray(payload)) {
    return payload as DexscreenerOrderStatus[];
  }

  if (isRecord(payload) && Array.isArray(payload.orders)) {
    return payload.orders as DexscreenerOrderStatus[];
  }

  throw new DexscreenerRequestError(`Dexscreener returned an invalid response shape for ${path}: expected an array or orders object.`, {
    retryable: false,
  });
}

async function fetchDexscreener<T>(
  path: string,
  requestOptions: DexscreenerRequestOptions = {},
  attempt = 0,
): Promise<T> {
  try {
    const response = await fetch(`${DEXSCREENER_API_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: getDexscreenerRequestSignal(requestOptions),
    });

    if (!response.ok) {
      const error = new DexscreenerRequestError(
        `Dexscreener request failed (${response.status} ${response.statusText}) for ${path}`,
        {
          retryable: DEXSCREENER_RETRYABLE_STATUS_CODES.has(response.status),
          status: response.status,
        },
      );
      if (shouldRetryDexscreenerError(error, requestOptions, attempt)) {
        await Bun.sleep(getDexscreenerRetryDelayMs(response, attempt));
        return fetchDexscreener<T>(path, requestOptions, attempt + 1);
      }
      throw error;
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new DexscreenerRequestError(`Dexscreener returned invalid JSON for ${path}`, {
        retryable: false,
        cause: error,
      });
    }
  } catch (error) {
    const requestError = toDexscreenerRequestError({
      error,
      path,
      requestOptions,
    });
    if (shouldRetryDexscreenerError(requestError, requestOptions, attempt)) {
      await Bun.sleep(DEXSCREENER_RETRY_BACKOFF_MS * (attempt + 1));
      return fetchDexscreener<T>(path, requestOptions, attempt + 1);
    }
    throw requestError;
  }
}

function getDexscreenerRetryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.round(retryAfterSeconds * 1000);
    }

    const retryAfterDate = Date.parse(retryAfter);
    if (Number.isFinite(retryAfterDate)) {
      return Math.max(0, retryAfterDate - Date.now());
    }
  }

  return DEXSCREENER_RETRY_BACKOFF_MS * (attempt + 1);
}

function isSolanaChainId(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === DEXSCREENER_SOLANA_CHAIN_ID;
}

function filterSolanaItems<T extends { chainId: string }>(items: T[]): T[] {
  return items.filter((item) => isSolanaChainId(item.chainId));
}

export interface DexscreenerTokenProfile {
  url?: string;
  chainId: string;
  tokenAddress: string;
  icon?: string;
  header?: string;
  description?: string;
  links?: Array<{
    type?: string;
    label?: string;
    url: string;
  }>;
}

export type DexscreenerTokenProfilesResponse = DexscreenerTokenProfile[];

export function getDexscreenerLatestTokenProfiles(
  input: DexscreenerInvokeBase = {},
): Promise<DexscreenerTokenProfilesResponse> {
  return fetchDexscreener<unknown>("/token-profiles/latest/v1", input.options)
    .then((payload) => assertDexscreenerArrayResponse<DexscreenerTokenProfile>(payload, "/token-profiles/latest/v1"))
    .then(filterSolanaItems);
}

export interface DexscreenerTokenBoost {
  url?: string;
  chainId: string;
  tokenAddress: string;
  amount: number;
  totalAmount: number;
  icon?: string;
  header?: string;
  description?: string;
  links?: Array<{
    type?: string;
    label?: string;
    url: string;
  }>;
}

export type DexscreenerTokenBoostsResponse = DexscreenerTokenBoost[];

export function getDexscreenerLatestTokenBoosts(
  input: DexscreenerInvokeBase = {},
): Promise<DexscreenerTokenBoostsResponse> {
  return fetchDexscreener<unknown>("/token-boosts/latest/v1", input.options)
    .then((payload) => assertDexscreenerArrayResponse<DexscreenerTokenBoost>(payload, "/token-boosts/latest/v1"))
    .then(filterSolanaItems);
}

export function getDexscreenerTopTokenBoosts(
  input: DexscreenerInvokeBase = {},
): Promise<DexscreenerTokenBoostsResponse> {
  return fetchDexscreener<unknown>("/token-boosts/top/v1", input.options)
    .then((payload) => assertDexscreenerArrayResponse<DexscreenerTokenBoost>(payload, "/token-boosts/top/v1"))
    .then(filterSolanaItems);
}

export interface DexscreenerOrderStatus {
  type?: string;
  status?: string;
  paymentTimestamp?: number;
}

export type DexscreenerOrdersResponse = DexscreenerOrderStatus[];

export function getDexscreenerOrdersByToken(
  input: DexscreenerInvokeWithTokenAddress,
): Promise<DexscreenerOrdersResponse> {
  const tokenAddress = assertNonEmptyParam("tokenAddress", input.tokenAddress);
  const path = `/orders/v1/${DEXSCREENER_SOLANA_CHAIN_ID}/${tokenAddress}`;
  return fetchDexscreener<unknown>(
    path,
    input.options,
  ).then((payload) =>
    assertDexscreenerOrdersResponse(payload, path),
  );
}

export interface DexscreenerPairToken {
  address?: string;
  name?: string;
  symbol?: string;
}

export interface DexscreenerPairInfo {
  chainId: string;
  dexId?: string;
  url?: string;
  pairAddress: string;
  labels?: string[];
  baseToken?: DexscreenerPairToken;
  quoteToken?: DexscreenerPairToken;
  priceNative?: string;
  priceUsd?: string;
  txns?: Record<string, unknown>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  liquidity?: {
    usd?: number;
    base?: number;
    quote?: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: Record<string, unknown>;
  boosts?: {
    active?: number;
  };
}

export interface DexscreenerPairsResponse {
  schemaVersion?: string;
  pairs: DexscreenerPairInfo[];
}

export function searchDexscreenerPairs(input: DexscreenerInvokeSearchPairs): Promise<DexscreenerPairsResponse> {
  const query = assertNonEmptyParam("query", input.query);
  const path = `/latest/dex/search?q=${encodeURIComponent(query)}`;
  return fetchDexscreener<unknown>(path, input.options).then((payload) => {
    const response = assertDexscreenerPairsResponse(payload, path);
    return {
    ...response,
    pairs: filterSolanaItems(response.pairs ?? []),
    };
  });
}

export interface DexscreenerPairResponse {
  schemaVersion?: string;
  pair: DexscreenerPairInfo | null;
}

export async function getDexscreenerPairByChainAndPairId(
  input: DexscreenerInvokeWithPairAddress,
): Promise<DexscreenerPairInfo | null> {
  const pairAddress = assertNonEmptyParam("pairAddress", input.pairAddress);
  const path = `/latest/dex/pairs/${DEXSCREENER_SOLANA_CHAIN_ID}/${pairAddress}`;
  const response = assertDexscreenerPairResponse(
    await fetchDexscreener<unknown>(path, input.options),
    path,
  );

  return response.pair ?? null;
}

export async function getDexscreenerTokenPairsByChain(
  input: DexscreenerInvokeWithTokenAddress,
): Promise<DexscreenerPairInfo[]> {
  const tokenAddress = assertNonEmptyParam("tokenAddress", input.tokenAddress);
  const path = `/token-pairs/v1/${DEXSCREENER_SOLANA_CHAIN_ID}/${tokenAddress}`;
  const response = assertDexscreenerPairListResponse(
    await fetchDexscreener<unknown>(path, input.options),
    path,
  );

  return response;
}

export async function getDexscreenerTokensByChain(
  input: DexscreenerInvokeTokens,
): Promise<DexscreenerPairInfo[]> {
  const tokenAddresses = assertTokenAddresses(input.tokenAddresses);
  const path = `/tokens/v1/${DEXSCREENER_SOLANA_CHAIN_ID}/${tokenAddresses.join(",")}`;
  const response = assertDexscreenerPairListResponse(
    await fetchDexscreener<unknown>(path, input.options),
    path,
  );

  return response;
}

export interface DexscreenerCommunityTakeover {
  url?: string;
  chainId: string;
  tokenAddress: string;
  icon?: string;
  header?: string;
  description?: string;
  links?: Array<{
    type?: string;
    label?: string;
    url: string;
  }>;
  claimDate?: string;
}

export type DexscreenerCommunityTakeoversResponse = DexscreenerCommunityTakeover[];

export function getDexscreenerLatestCommunityTakeovers(
  input: DexscreenerInvokeBase = {},
): Promise<DexscreenerCommunityTakeoversResponse> {
  return fetchDexscreener<unknown>("/community-takeovers/latest/v1", input.options)
    .then((payload) =>
      assertDexscreenerArrayResponse<DexscreenerCommunityTakeover>(payload, "/community-takeovers/latest/v1"))
    .then(filterSolanaItems);
}

export interface DexscreenerAd {
  url?: string;
  chainId: string;
  tokenAddress: string;
  date?: string;
  type?: string;
  durationHours?: number | null;
  impressions?: number | null;
}

export type DexscreenerAdsResponse = DexscreenerAd[];

export function getDexscreenerLatestAds(input: DexscreenerInvokeBase = {}): Promise<DexscreenerAdsResponse> {
  return fetchDexscreener<unknown>("/ads/latest/v1", input.options)
    .then((payload) => assertDexscreenerArrayResponse<DexscreenerAd>(payload, "/ads/latest/v1"))
    .then(filterSolanaItems);
}

export function isDexscreenerRetryableError(error: unknown): boolean {
  return error instanceof DexscreenerRequestError && error.retryable;
}
