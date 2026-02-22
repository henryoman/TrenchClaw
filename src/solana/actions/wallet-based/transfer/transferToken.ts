// Action: transferToken
// Category: wallet-based
// Subcategory: transfer
// Wallet required: Yes (full signing authority)
//
// Sends SPL tokens from the active wallet to a destination address.
//
// Input:
//   mintAddress: string   — Token mint to transfer.
//   destination: string   — Recipient wallet address.
//   amount: number        — Amount in human-readable units.
//
// Output:
//   txSignature: string   — Confirmed transaction signature.
//   amount: number        — Amount sent (human units).
//   mintAddress: string   — Token mint transferred.
//   destination: string   — Recipient address.
//   fee: number           — Transaction fee in SOL.
//
// Execution flow:
//   1. Validate destination is a valid public key.
//   2. Resolve source ATA (must exist and have sufficient balance).
//   3. Derive destination ATA. If it doesn't exist, include createATA instruction.
//   4. Resolve token decimals via token-account adapter.
//   5. Convert human amount to raw units.
//   6. Build spl-token transfer instruction.
//   7. Get recent blockhash, build + sign transaction.
//   8. Send via RPC pool + await confirmation.
//
// Used by:
//   - Direct operator commands.
//   - Future: token distribution, airdrop routines.
