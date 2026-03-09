# Dexscreener Data Retrieval Guide

TrenchClaw uses Dexscreener as a **Solana-only market discovery surface**.
These actions are for finding boosted tokens, recent paid promotion activity, token profiles, pairs, and pair-level market context.

Do not pass a chain field. The runtime hardcodes Solana where needed and filters multi-chain responses down to Solana before returning them.

## What to use for what

Use these actions when you want:

- **Top promoted tokens right now**: `getDexscreenerTopTokenBoosts()`
- **Newest paid boosts**: `getDexscreenerLatestTokenBoosts()`
- **Newest token profile listings**: `getDexscreenerLatestTokenProfiles()`
- **Recent promoted/ad activity**: `getDexscreenerLatestAds()`
- **Recent community-led claim/takeover activity**: `getDexscreenerLatestCommunityTakeovers()`
- **A token's paid order / promotion status**: `getDexscreenerOrdersByToken({ tokenAddress })`
- **Search by symbol, name, token address, or pair address**: `searchDexscreenerPairs({ query })`
- **Get a specific pair**: `getDexscreenerPairByChainAndPairId({ pairAddress })`
- **Get all Solana pools for one token**: `getDexscreenerTokenPairsByChain({ tokenAddress })`
- **Batch-load market context for up to 30 Solana token addresses**: `getDexscreenerTokensByChain({ tokenAddresses })`

## Practical guidance

- `getDexscreenerTopTokenBoosts()` is the best first pass for "top tokens" if the request is really about current paid momentum.
- `getDexscreenerLatestTokenBoosts()` is better for "who just upgraded / who just boosted recently".
- `getDexscreenerLatestAds()` and `getDexscreenerLatestCommunityTakeovers()` are separate feeds and should not be confused with boosts.
- `getDexscreenerLatestTokenProfiles()` is discovery metadata, not proof of quality or liquidity.
- `searchDexscreenerPairs()` is good for open-ended discovery, but pair-level follow-up should usually use `getDexscreenerPairByChainAndPairId()` or `getDexscreenerTokenPairsByChain()`.
- For a watchlist or candidate set, use `getDexscreenerTokensByChain()` after discovery to load price, liquidity, volume, FDV, market cap, and boosts in one batch.
- Dexscreener does not mean "safe" or "good". These actions return market discovery data only.

## Robustness rules

- Empty `tokenAddress`, `pairAddress`, and `query` values are rejected.
- `tokenAddresses` must contain between `1` and `30` addresses.
- Multi-chain "latest" and search endpoints are filtered to Solana before returning.
- The fetch layer now retries short-lived Dexscreener failures on `429`, `500`, `502`, `503`, and `504`.
- If Dexscreener sends a `Retry-After` header, the runtime respects it before retrying.
- Hard failures still include the endpoint path and HTTP status in the thrown error.

## Canonical invocation shapes

```ts
getDexscreenerTopTokenBoosts({});
getDexscreenerLatestTokenBoosts({});
getDexscreenerLatestTokenProfiles({});
getDexscreenerLatestAds({});
getDexscreenerLatestCommunityTakeovers({});
getDexscreenerOrdersByToken({ tokenAddress: "..." });
searchDexscreenerPairs({ query: "SOL/USDC" });
getDexscreenerPairByChainAndPairId({ pairAddress: "..." });
getDexscreenerTokenPairsByChain({ tokenAddress: "..." });
getDexscreenerTokensByChain({ tokenAddresses: ["...", "..."] });
```

## Returned data expectations

Key returned shapes you can rely on:

- Boost feeds include Solana token addresses and paid boost totals.
- Profile feeds include token address, optional icon/header/description, and outbound links.
- Pair feeds include pair address, base token, quote token, price, liquidity, volume, price change, FDV, market cap, and boost count when available.
- Ads feed includes recent ad metadata such as `date`, `type`, `durationHours`, and `impressions` when Dexscreener provides them.
- Community takeover feed includes recent takeover metadata and `claimDate` when Dexscreener provides it.
- Orders feed returns the token's Dexscreener-paid order status entries.

## Recommended flow patterns

### "Show me top Solana tokens right now"

1. Call `getDexscreenerTopTokenBoosts()`.
2. Extract the strongest Solana candidates.
3. Call `getDexscreenerTokensByChain()` with those token addresses.
4. Rank or explain them using liquidity, volume, price action, FDV, market cap, and boost context.

### "Who recently upgraded / boosted / paid for visibility?"

Use this order:

1. `getDexscreenerLatestTokenBoosts()`
2. `getDexscreenerLatestAds()`
3. `getDexscreenerLatestCommunityTakeovers()`
4. `getDexscreenerOrdersByToken({ tokenAddress })` for confirmation on one token

### "Find the real pair for this ticker"

1. `searchDexscreenerPairs({ query })`
2. Filter to the most liquid / relevant Solana pair
3. Follow with `getDexscreenerPairByChainAndPairId({ pairAddress })`

## Do not do this

- Do not ask for Ethereum, Base, or any non-Solana chain through these actions.
- Do not treat token profiles, ads, boosts, or takeovers as trust signals.
- Do not call `searchDexscreenerPairs()` when you already have the exact Solana pair address.
- Do not call `getDexscreenerTokensByChain()` with more than `30` token addresses in one request.
