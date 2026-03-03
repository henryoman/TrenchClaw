// Action: getTokenMetadata
// Category: data-based
// Wallet required: No
//
// Fetches metadata for a token mint: name, symbol, decimals, supply, and trust signals.
//
// Input:
//   mintAddress: string — The token mint to look up.
//
// Output:
//   name: string        — Token name (from Metaplex metadata or on-chain).
//   symbol: string      — Token symbol.
//   decimals: number    — Number of decimal places.
//   supply: number      — Total supply in human-readable units.
//   mintAuthority?: string   — Current mint authority (null if renounced).
//   freezeAuthority?: string — Current freeze authority (null if renounced).
//   isVerified?: boolean     — Whether the token is verified on known registries.
//
// Used by:
//   - Policy engine (token allowlist/denylist checks, trust scoring).
//   - TUI (display token info in dashboards).
//   - Routines (resolve decimals before building swap amounts).
//
// Fetches from on-chain account data via RPC pool + Metaplex metadata program.
