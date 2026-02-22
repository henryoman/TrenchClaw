// Action: transferSol
// Category: wallet-based
// Subcategory: transfer
// Wallet required: Yes (full signing authority)
//
// Sends SOL from the active wallet to a destination address.
//
// Input:
//   destination: string  — Recipient wallet address (base58 public key).
//   amount: number       — Amount in SOL (human-readable, not lamports).
//
// Output:
//   txSignature: string  — Confirmed transaction signature.
//   amount: number       — Amount sent in SOL.
//   destination: string  — Recipient address.
//   fee: number          — Transaction fee in SOL.
//
// Execution flow:
//   1. Validate destination is a valid public key.
//   2. Convert SOL amount to lamports.
//   3. Build SystemProgram.transfer instruction.
//   4. Get recent blockhash from RPC pool.
//   5. Build + sign transaction.
//   6. Send via RPC pool + await confirmation.
//
// Used by:
//   - Direct operator commands.
//   - Future: multi-wallet rebalancing, profit withdrawal routines.
