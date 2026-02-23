# Dexscreener Actions Invocation Standard

This is the **standard invocation format** for all Dexscreener data actions in TrenchClaw.

## Global invocation shape

```ts
{
  // action-specific fields
  options?: {
    signal?: AbortSignal;
  };
}
```

## Control and validation rules

- `chainId`, `tokenAddress`, `pairAddress`, and `query` are required when listed for an action.
- All required string fields are trimmed and rejected if empty.
- `tokenAddresses` must contain between **1 and 30** addresses.
- HTTP failures throw errors with endpoint path and status details.

## Action reference

### 1) `getDexscreenerLatestTokenProfiles(input?)`
- **Input**: `{ options? }`
- **Endpoint**: `GET /token-profiles/latest/v1`
- **Returns**: `DexscreenerTokenProfilesResponse`

### 2) `getDexscreenerLatestTokenBoosts(input?)`
- **Input**: `{ options? }`
- **Endpoint**: `GET /token-boosts/latest/v1`
- **Returns**: `DexscreenerTokenBoostsResponse`

### 3) `getDexscreenerTopTokenBoosts(input?)`
- **Input**: `{ options? }`
- **Endpoint**: `GET /token-boosts/top/v1`
- **Returns**: `DexscreenerTokenBoostsResponse`

### 4) `getDexscreenerOrdersByToken(input)`
- **Input**: `{ chainId: string; tokenAddress: string; options? }`
- **Endpoint**: `GET /orders/v1/{chainId}/{tokenAddress}`
- **Returns**: `DexscreenerOrdersResponse`

### 5) `searchDexscreenerPairs(input)`
- **Input**: `{ query: string; options? }`
- **Endpoint**: `GET /latest/dex/search?q=text`
- **Returns**: `DexscreenerPairsResponse`

### 6) `getDexscreenerPairByChainAndPairId(input)`
- **Input**: `{ chainId: string; pairAddress: string; options? }`
- **Endpoint**: `GET /latest/dex/pairs/{chainId}/{pairId}`
- **Returns**: `DexscreenerPairInfo | null`

### 7) `getDexscreenerTokenPairsByChain(input)`
- **Input**: `{ chainId: string; tokenAddress: string; options? }`
- **Endpoint**: `GET /token-pairs/v1/{chainId}/{tokenAddress}`
- **Returns**: `DexscreenerPairInfo[]`

### 8) `getDexscreenerTokensByChain(input)`
- **Input**: `{ chainId: string; tokenAddresses: string[]; options? }`
- **Endpoint**: `GET /tokens/v1/{chainId}/{tokenAddresses}`
- **Returns**: `DexscreenerPairInfo[]`

### 9) `getDexscreenerLatestCommunityTakeovers(input?)`
- **Input**: `{ options? }`
- **Endpoint**: `GET /community-takeovers/latest/v1`
- **Returns**: `DexscreenerCommunityTakeoversResponse`

### 10) `getDexscreenerLatestAds(input?)`
- **Input**: `{ options? }`
- **Endpoint**: `GET /ads/latest/v1`
- **Returns**: `DexscreenerAdsResponse`
