// Action: checkBalance
// Category: wallet-based
// Subcategory: read-only
// Wallet required: Yes (public key only, no signing)
//
// Returns the balance of a specific SPL token for the active wallet.
//
// Input:
//   mintAddress: string — The token mint to check balance for.
//
// Output:
//   balance: number       — Token balance in human-readable units.
//   rawBalance: number    — Raw token amount (smallest units).
//   decimals: number      — Token decimals used for conversion.
//   mintAddress: string   — The mint checked.
//   ataAddress: string    — The Associated Token Account address.
//   walletAddress: string — The wallet public key checked.
//
// Used by:
//   - Swing/percentage routines (check token balance before sell phase).
//   - Policy engine (verify post-trade balance sanity).
//   - TUI portfolio view.
//
// Calls token-account adapter's getTokenBalance() through the RPC pool.
