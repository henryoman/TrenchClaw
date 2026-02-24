// Action: createToken
// Category: wallet-based
// Subcategory: mint
// Wallet required: Yes (full signing authority)
//
// Creates a new SPL token mint with configurable parameters.
//
// Input:
//   name: string          — Token name (stored in Metaplex metadata).
//   symbol: string        — Token symbol.
//   decimals: number      — Number of decimal places (default: 9).
//   initialSupply?: number — If set, mint this amount to the wallet's ATA.
//   uri?: string          — Metadata URI (off-chain JSON with image, description, etc).
//   revokeMintAuthority?: boolean   — Renounce mint authority after creation (default: false).
//   revokeFreezeAuthority?: boolean — Renounce freeze authority after creation (default: true).
//
// Output:
//   mintAddress: string    — The new token's mint address.
//   txSignature: string    — Transaction signature.
//   metadataAddress?: string — Metaplex metadata account address.
//   ataAddress: string     — The wallet's ATA for the new token.
//   supply: number         — Initial supply minted (0 if no initialSupply).
//
// Execution flow:
//   1. Generate new Keypair for the mint account.
//   2. Build instructions: createAccount, initializeMint, createATA,
//      (optional) mintTo, createMetadata.
//   3. If revokeMintAuthority: include setAuthority(null) instruction.
//   4. If revokeFreezeAuthority: include setAuthority(null) instruction.
//   5. Get recent blockhash, build versioned transaction.
//   6. Sign with wallet + mint keypair.
//   7. Send via RPC pool + await confirmation.
//
// Uses lib/client/ generated clients for Metaplex Token Metadata program
// and SPL Token program interactions where applicable.
