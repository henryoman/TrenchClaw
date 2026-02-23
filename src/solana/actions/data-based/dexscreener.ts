const DEXSCREENER_API_BASE_URL = "https://api.dexscreener.com";

export interface DexscreenerRequestOptions {
  signal?: AbortSignal;
}

async function fetchDexscreener<T>(
  path: string,
  options: DexscreenerRequestOptions = {},
): Promise<T> {
  const response = await fetch(`${DEXSCREENER_API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Dexscreener request failed (${response.status} ${response.statusText}) for ${path}`);
  }

  return (await response.json()) as T;
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
  options?: DexscreenerRequestOptions,
): Promise<DexscreenerTokenProfilesResponse> {
  return fetchDexscreener<DexscreenerTokenProfilesResponse>("/token-profiles/latest/v1", options);
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
  options?: DexscreenerRequestOptions,
): Promise<DexscreenerTokenBoostsResponse> {
  return fetchDexscreener<DexscreenerTokenBoostsResponse>("/token-boosts/latest/v1", options);
}

export function getDexscreenerTopTokenBoosts(
  options?: DexscreenerRequestOptions,
): Promise<DexscreenerTokenBoostsResponse> {
  return fetchDexscreener<DexscreenerTokenBoostsResponse>("/token-boosts/top/v1", options);
}

export interface DexscreenerOrderStatus {
  type?: string;
  status?: string;
  paymentTimestamp?: number;
}

export type DexscreenerOrdersResponse = DexscreenerOrderStatus[];

export function getDexscreenerOrdersByToken(
  chainId: string,
  tokenAddress: string,
  options?: DexscreenerRequestOptions,
): Promise<DexscreenerOrdersResponse> {
  return fetchDexscreener<DexscreenerOrdersResponse>(`/orders/v1/${chainId}/${tokenAddress}`, options);
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

export function searchDexscreenerPairs(
  query: string,
  options?: DexscreenerRequestOptions,
): Promise<DexscreenerPairsResponse> {
  return fetchDexscreener<DexscreenerPairsResponse>(
    `/latest/dex/search?q=${encodeURIComponent(query)}`,
    options,
  );
}

export interface DexscreenerPairResponse {
  schemaVersion?: string;
  pair: DexscreenerPairInfo | null;
}

export async function getDexscreenerPairByChainAndPairId(
  chainId: string,
  pairId: string,
  options?: DexscreenerRequestOptions,
): Promise<DexscreenerPairInfo | null> {
  const response = await fetchDexscreener<DexscreenerPairResponse>(
    `/latest/dex/pairs/${chainId}/${pairId}`,
    options,
  );

  return response.pair ?? null;
}

export async function getDexscreenerTokenPairsByChain(
  chainId: string,
  tokenAddress: string,
  options?: DexscreenerRequestOptions,
): Promise<DexscreenerPairInfo[]> {
  const response = await fetchDexscreener<DexscreenerPairsResponse>(
    `/token-pairs/v1/${chainId}/${tokenAddress}`,
    options,
  );

  return response.pairs;
}

export async function getDexscreenerTokensByChain(
  chainId: string,
  tokenAddresses: string[],
  options?: DexscreenerRequestOptions,
): Promise<DexscreenerPairInfo[]> {
  const normalizedAddresses = tokenAddresses.map((item) => item.trim()).filter(Boolean);
  const response = await fetchDexscreener<DexscreenerPairsResponse>(
    `/tokens/v1/${chainId}/${normalizedAddresses.join(",")}`,
    options,
  );

  return response.pairs;
}

export interface DexscreenerCommunityTakeover {
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

export type DexscreenerCommunityTakeoversResponse = DexscreenerCommunityTakeover[];

export function getDexscreenerLatestCommunityTakeovers(
  options?: DexscreenerRequestOptions,
): Promise<DexscreenerCommunityTakeoversResponse> {
  return fetchDexscreener<DexscreenerCommunityTakeoversResponse>(
    "/community-takeovers/latest/v1",
    options,
  );
}

export interface DexscreenerAd {
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

export type DexscreenerAdsResponse = DexscreenerAd[];

export function getDexscreenerLatestAds(
  options?: DexscreenerRequestOptions,
): Promise<DexscreenerAdsResponse> {
  return fetchDexscreener<DexscreenerAdsResponse>("/ads/latest/v1", options);
}
