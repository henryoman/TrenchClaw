const DEXSCREENER_API_BASE_URL = "https://api.dexscreener.com";
const MAX_TOKEN_ADDRESSES_PER_REQUEST = 30;
const DEXSCREENER_SOLANA_CHAIN_ID = "solana";
const DEXSCREENER_MAX_RETRIES = 2;
const DEXSCREENER_RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const DEXSCREENER_RETRY_BACKOFF_MS = 750;

export interface DexscreenerRequestOptions {
  signal?: AbortSignal;
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

function assertNonEmptyParam(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Dexscreener invocation error: "${name}" cannot be empty.`);
  }

  return normalized;
}

function assertTokenAddresses(tokenAddresses: string[]): string[] {
  const normalized = tokenAddresses.map((item) => item.trim()).filter(Boolean);

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

async function fetchDexscreener<T>(
  path: string,
  requestOptions: DexscreenerRequestOptions = {},
  attempt = 0,
): Promise<T> {
  const response = await fetch(`${DEXSCREENER_API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal: requestOptions.signal,
  });

  if (!response.ok) {
    if (
      DEXSCREENER_RETRYABLE_STATUS_CODES.has(response.status) &&
      attempt < DEXSCREENER_MAX_RETRIES &&
      !requestOptions.signal?.aborted
    ) {
      await Bun.sleep(getDexscreenerRetryDelayMs(response, attempt));
      return fetchDexscreener<T>(path, requestOptions, attempt + 1);
    }

    throw new Error(`Dexscreener request failed (${response.status} ${response.statusText}) for ${path}`);
  }

  return (await response.json()) as T;
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
  return fetchDexscreener<DexscreenerTokenProfilesResponse>("/token-profiles/latest/v1", input.options)
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
  return fetchDexscreener<DexscreenerTokenBoostsResponse>("/token-boosts/latest/v1", input.options)
    .then(filterSolanaItems);
}

export function getDexscreenerTopTokenBoosts(
  input: DexscreenerInvokeBase = {},
): Promise<DexscreenerTokenBoostsResponse> {
  return fetchDexscreener<DexscreenerTokenBoostsResponse>("/token-boosts/top/v1", input.options)
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
  return fetchDexscreener<DexscreenerOrdersResponse>(
    `/orders/v1/${DEXSCREENER_SOLANA_CHAIN_ID}/${tokenAddress}`,
    input.options,
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
  return fetchDexscreener<DexscreenerPairsResponse>(
    `/latest/dex/search?q=${encodeURIComponent(query)}`,
    input.options,
  ).then((response) => ({
    ...response,
    pairs: filterSolanaItems(response.pairs ?? []),
  }));
}

export interface DexscreenerPairResponse {
  schemaVersion?: string;
  pair: DexscreenerPairInfo | null;
}

export async function getDexscreenerPairByChainAndPairId(
  input: DexscreenerInvokeWithPairAddress,
): Promise<DexscreenerPairInfo | null> {
  const pairAddress = assertNonEmptyParam("pairAddress", input.pairAddress);
  const response = await fetchDexscreener<DexscreenerPairResponse>(
    `/latest/dex/pairs/${DEXSCREENER_SOLANA_CHAIN_ID}/${pairAddress}`,
    input.options,
  );

  return response.pair ?? null;
}

export async function getDexscreenerTokenPairsByChain(
  input: DexscreenerInvokeWithTokenAddress,
): Promise<DexscreenerPairInfo[]> {
  const tokenAddress = assertNonEmptyParam("tokenAddress", input.tokenAddress);
  const response = await fetchDexscreener<DexscreenerPairsResponse>(
    `/token-pairs/v1/${DEXSCREENER_SOLANA_CHAIN_ID}/${tokenAddress}`,
    input.options,
  );

  return response.pairs;
}

export async function getDexscreenerTokensByChain(
  input: DexscreenerInvokeTokens,
): Promise<DexscreenerPairInfo[]> {
  const tokenAddresses = assertTokenAddresses(input.tokenAddresses);
  const response = await fetchDexscreener<DexscreenerPairsResponse>(
    `/tokens/v1/${DEXSCREENER_SOLANA_CHAIN_ID}/${tokenAddresses.join(",")}`,
    input.options,
  );

  return response.pairs;
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
  return fetchDexscreener<DexscreenerCommunityTakeoversResponse>(
    "/community-takeovers/latest/v1",
    input.options,
  ).then(filterSolanaItems);
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
  return fetchDexscreener<DexscreenerAdsResponse>("/ads/latest/v1", input.options)
    .then(filterSolanaItems);
}
