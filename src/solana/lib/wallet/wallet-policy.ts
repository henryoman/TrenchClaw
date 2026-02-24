// TrenchClaw — Wallet Signing Policy Engine
//
// Evaluates signing policies before every transaction signing request.
// Modeled after Turnkey's policy engine: deny overrides allow, implicit deny by default.
//
// Evaluation flow:
//   1. Load all policies for the wallet from wallet-store.
//   2. For each policy, evaluate all conditions against the SigningRequest.
//   3. A policy "matches" if ALL its conditions are satisfied.
//   4. If ANY deny policy matches → BLOCK. Deny always wins.
//   5. If NO allow policy matches → BLOCK. Implicit deny.
//   6. If at least one allow matches and no deny matches → ALLOW.
//   7. Log the result to wallet-store (signing_log table).
//   8. Emit wallet:policy-block event if blocked.
//
// Condition evaluators:
//
//   maxAmountPerTx:
//     Check estimatedLamports <= policy limit.
//
//   maxAmountPerDay:
//     Sum today's signing_log lamports for this wallet. Check total + current <= limit.
//
//   allowedDestinations:
//     Check destination address is in the allowlist.
//
//   blockedDestinations:
//     Check destination address is NOT in the blocklist.
//
//   allowedPrograms:
//     Check all programIds in the transaction are in the allowlist.
//
//   blockedPrograms:
//     Check none of the programIds are in the blocklist.
//
//   maxTransactionsPerDay:
//     Count today's signing_log entries for this wallet. Check count < limit.
//
//   requireConfirmation:
//     If enabled, pause and require operator confirmation via TUI before signing.
//     (Only works in interactive mode, not headless.)
//
//   timeWindow:
//     Check current hour is between startHour and endHour.
//
//   cooldownSeconds:
//     Check that the last signing_log entry for this wallet is older than N seconds.
//
// Interface:
//   evaluate(request: SigningRequest): Promise<SigningResult>
//     Returns { allowed: boolean, policyName?: string, reason?: string }
