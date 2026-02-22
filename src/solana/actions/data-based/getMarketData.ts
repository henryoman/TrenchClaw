// Action: getMarketData
// Category: data-based
// Wallet required: No
//
// Aggregates market data for a token: liquidity depth, volume, holder count.
// Combines data from multiple sources (Jupiter, on-chain pool accounts).
//
// Input:
//   mintAddress: string — The token mint to analyze.
//
// Output:
//   liquidity: number     — Total liquidity available across known pools (in USD).
//   volume24h?: number    — 24h trading volume if available.
//   priceImpact1Sol?: number — Estimated price impact for a 1 SOL buy.
//   topPools?: PoolInfo[] — List of known liquidity pools for this token.
//
// Used by:
//   - Policy engine (min liquidity checks, max price impact guardrails).
//   - Routines (decide whether to trade based on market conditions).
//   - Sniper trigger (evaluate new pools for sufficient liquidity).
//
// Design notes:
//   - This is an expensive action (multiple RPC calls). Cache results for short TTL.
//   - May combine Jupiter route data with direct pool account queries.
