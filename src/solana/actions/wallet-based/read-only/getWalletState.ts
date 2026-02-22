// Action: getWalletState
// Category: wallet-based
// Subcategory: read-only
// Wallet required: Yes (public key only, no signing)
//
// Returns a full snapshot of the wallet: SOL balance, all SPL token balances,
// ATA addresses, and a summary of recent transactions.
//
// Input:
//   (none — uses wallet from ActionContext)
//   includeRecentTx?: boolean — Whether to fetch recent transaction signatures (default: false).
//   recentTxLimit?: number    — How many recent tx to include (default: 10).
//
// Output:
//   walletAddress: string
//   solBalance: number
//   tokenBalances: Array<{
//     mintAddress: string
//     symbol?: string
//     balance: number
//     decimals: number
//     ataAddress: string
//   }>
//   recentTransactions?: Array<{
//     signature: string
//     blockTime: number
//     status: "success" | "failed"
//   }>
//
// Used by:
//   - TUI overview dashboard (full wallet state at a glance).
//   - Bot startup (initialize context with current balances).
//   - Decision logging (snapshot before/after trade for auditability).
//
// Combines multiple adapter calls: getSolBalance + getAllTokenBalances + optional getSignaturesForAddress.
