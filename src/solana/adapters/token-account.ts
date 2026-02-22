// TrenchClaw — Token Account Service
//
// Handles all SPL token account queries and metadata resolution.
// Used by read-only actions, swap actions (for balance checks), and routines.
//
// Capabilities:
//   - Get SOL balance for a wallet.
//   - Get SPL token balance for a specific mint + wallet.
//   - List all token accounts owned by a wallet (getTokenAccountsByOwner).
//   - Find or derive Associated Token Account (ATA) address.
//   - Resolve token decimals for a given mint.
//   - Fetch token metadata (name, symbol, decimals, supply) via on-chain data
//     or Metaplex metadata accounts.
//
// Interface:
//   - getSolBalance(walletPubkey): Promise<number>  (in SOL, not lamports)
//   - getTokenBalance(walletPubkey, mintAddress): Promise<number>  (in human units)
//   - getAllTokenBalances(walletPubkey): Promise<TokenBalance[]>
//   - getDecimals(mintAddress): Promise<number>
//   - getAtaAddress(walletPubkey, mintAddress): PublicKey
//   - getTokenMetadata(mintAddress): Promise<TokenMetadata>
//
// Design notes:
//   - All RPC calls go through the RPC pool (passed via ActionContext).
//   - Decimal resolution is cached in-memory per mint (decimals don't change).
//   - Returns human-readable numbers (SOL not lamports, tokens not raw amounts).
//     Actions work in human units. Adapters handle conversion.
//   - Does NOT create ATAs. That's a wallet-based action concern.
