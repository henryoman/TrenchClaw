// Action: checkSolBalance
// Category: wallet-based
// Subcategory: read-only
// Wallet required: Yes (public key only, no signing)
//
// Returns the SOL balance of the active wallet.
//
// Input:
//   (none — uses wallet from ActionContext)
//
// Output:
//   balanceSol: number    — Balance in SOL (human-readable, not lamports).
//   balanceLamports: number — Raw balance in lamports.
//   walletAddress: string — The wallet public key checked.
//
// Used by:
//   - Routines (percentage-based strategies need current balance).
//   - Policy engine (insufficient balance pre-checks).
//   - TUI overview (display wallet balance).
//
// Calls token-account adapter's getSolBalance() through the RPC pool.
