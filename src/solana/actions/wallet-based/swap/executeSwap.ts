// Action: executeSwap
// Category: wallet-based
// Subcategory: swap
// Wallet required: Yes (full signing authority)
//
// Executes a swap transaction using a Jupiter quote.
// This is the core trade action. Always preceded by quoteSwap.
//
// Input:
//   quoteResponse: object  — The raw Jupiter quote response from quoteSwap.
//   priorityFeeLamports?: number — Priority fee in lamports (default: configurable).
//
// Output:
//   txSignature: string     — The confirmed transaction signature.
//   inputAmount: number     — Actual input amount (human units).
//   outputAmount: number    — Expected output amount (human units).
//   priceImpactPct: number  — Price impact from the quote.
//   slot: number            — Slot the transaction was confirmed in.
//
// Execution flow:
//   1. Call Jupiter adapter to get serialized swap transaction.
//   2. Deserialize the versioned transaction.
//   3. Sign with wallet from ActionContext.
//   4. Optionally simulate via RPC pool before sending (configurable).
//   5. Send signed transaction via RPC pool.
//   6. Wait for confirmation (commitment level from context).
//   7. Return receipt with signature and execution details.
//
// Error handling:
//   - Simulation failure → return retryable=false with simulation logs.
//   - Send failure → return retryable=true (network issue, try different RPC).
//   - Confirmation timeout → return retryable=true with partial info.
//
// Policy gates (handled by dispatcher, not this action):
//   - Pre: max notional, slippage limit, token allowlist, cooldown.
//   - Post: balance sanity check, actual vs expected slippage.
