const DEXSCREENER_API_BASE_URL = "https://api.dexscreener.com";
const MAX_TOKEN_ADDRESSES_PER_REQUEST = 30;
const DEXSCREENER_SOLANA_CHAIN_ID = "solana";

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
): Promise<T> {
  const response = await fetch(`${DEXSCREENER_API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal: requestOptions.signal,
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
  input: DexscreenerInvokeBase = {},
): Promise<DexscreenerTokenProfilesResponse> {
  return fetchDexscreener<DexscreenerTokenProfilesResponse>("/token-profiles/latest/v1", input.options);
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
  return fetchDexscreener<DexscreenerTokenBoostsResponse>("/token-boosts/latest/v1", input.options);
}

export function getDexscreenerTopTokenBoosts(
  input: DexscreenerInvokeBase = {},
): Promise<DexscreenerTokenBoostsResponse> {
  return fetchDexscreener<DexscreenerTokenBoostsResponse>("/token-boosts/top/v1", input.options);
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
  );
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
  input: DexscreenerInvokeBase = {},
): Promise<DexscreenerCommunityTakeoversResponse> {
  return fetchDexscreener<DexscreenerCommunityTakeoversResponse>(
    "/community-takeovers/latest/v1",
    input.options,
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

export function getDexscreenerLatestAds(input: DexscreenerInvokeBase = {}): Promise<DexscreenerAdsResponse> {
  return fetchDexscreener<DexscreenerAdsResponse>("/ads/latest/v1", input.options);
}
