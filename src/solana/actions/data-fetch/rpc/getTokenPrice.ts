// Action: getTokenPrice
// Category: data-based
// Wallet required: No
//
// Fetches the current price of a token in USD or SOL terms.
// Uses Jupiter quote API or a price oracle adapter as the data source.
//
// Input:
//   mintAddress: string   — The token mint to price.
//   denomination?: string — "USD" | "SOL" (default: "USD").
//
// Output:
//   price: number         — Current price in the requested denomination.
//   source: string        — Data source used (e.g. "jupiter", "pyth").
//   confidence?: number   — Confidence interval if available from oracle.
//   timestamp: number     — When the price was fetched.
//
// Used by:
//   - Price triggers (to evaluate threshold conditions).
//   - Routines (to calculate position sizing).
//   - TUI overview (to display portfolio value).
//
// No wallet signing required. Pure data fetch through RPC pool.
