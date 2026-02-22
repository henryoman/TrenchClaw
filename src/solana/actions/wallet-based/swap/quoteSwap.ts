// Action: quoteSwap
// Category: wallet-based
// Subcategory: swap
// Wallet required: Yes (public key for route calculation, no signing)
//
// Gets a Jupiter quote for swapping between two tokens.
// This is a read-only action (no transaction sent). Use executeSwap to trade.
//
// Input:
//   inputMint: string     — Token mint to sell.
//   outputMint: string    — Token mint to buy.
//   amount: number        — Amount to sell in human-readable units.
//   slippageBps?: number  — Slippage tolerance in basis points (default: 50 = 0.5%).
//
// Output:
//   inputAmount: number       — Confirmed input amount (human units).
//   outputAmount: number      — Expected output amount (human units).
//   priceImpactPct: number    — Price impact as percentage.
//   routePlan: string[]       — DEX route description.
//   quoteResponse: object     — Raw Jupiter quote response (passed to executeSwap).
//   inputMint: string
//   outputMint: string
//
// Used by:
//   - Routines (get quote before deciding whether to execute).
//   - Policy engine (check price impact and slippage before allowing trade).
//   - TUI (show quote preview to operator).
//
// Calls Jupiter adapter's quote() method. Resolves decimals via token-account adapter.
