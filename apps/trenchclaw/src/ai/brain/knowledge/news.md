# News And Market Data Playbook

Use this file when the user asks for crypto news, sentiment, trending topics,
token discovery, market comparisons, or holder concentration.

## Latest News

- `getCryptoNewsLatest`
  - use for broad recent crypto headlines
- `getLatestSolanaNews`
  - use for Solana-specific recent news
- `searchCryptoNews`
  - use when the user gives a token, company, wallet, or topic keyword

## Sentiment And Trend Reads

- `getCryptoAssetSentiment`
  - use for token or asset sentiment reads
- `getCryptoTrendingTopics`
  - use for broader market themes and discussion topics
- `getCryptoFearGreedIndex`
  - use for high-level market risk tone

## Token And Pair Discovery

- `searchDexscreenerPairs`
  - use when identity is fuzzy and you need to find the right pair first
- `getDexscreenerTokenPairsByChain`
  - use for a known token on a known chain
- `getDexscreenerPairByChainAndPairId`
  - use when pair id is already known

## Holder And Launch Analysis

- `getTokenHolderDistribution`
  - use for whale concentration or holder distribution
- `getTokenLaunchTime`
  - use for launch timing
- `getTokenPricePerformance`
  - use for price movement summary

## Routing Rules

- start with the smallest discovery read that resolves the asset clearly
- use live tools for current market truth instead of docs
- if the user wants deeper vendor/API detail, open the deep-knowledge references

## If You Need More Detail

- open `commands` for the shortest command map
- open deep docs like `dexscreener-api-reference` or `geckoterminal-api-docs` only when the live tools are not enough
