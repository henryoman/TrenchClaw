// TrenchClaw — Wallet Types
//
// All interfaces for the wallet management layer.
// See WALLET_MANAGEMENT.md for full design rationale.
//
// Wallet              — Named container holding an encrypted seed or private key.
//                       Fields: id, name, type (hd|imported), encryptedSeed,
//                       encryptedPrivateKey, nextDerivationIndex, policies, createdAt.
//
// WalletAccount       — A single Solana address derived from a wallet.
//                       Fields: id, walletId, label, address, derivationPath,
//                       derivationIndex, isDefault, createdAt.
//
// WalletPolicy        — Signing policy attached to a wallet.
//                       Fields: id, walletId, effect (allow|deny), name, conditions.
//
// PolicyCondition     — Union type of all supported policy conditions.
//                       Variants: maxAmountPerTx, maxAmountPerDay, allowedDestinations,
//                       blockedDestinations, allowedPrograms, blockedPrograms,
//                       maxTransactionsPerDay, requireConfirmation, timeWindow,
//                       cooldownSeconds.
//
// SigningRequest      — Submitted to the policy evaluator before every sign.
//                       Fields: walletId, accountId, actionName, jobId,
//                       transactionMessage, estimatedLamports, destination,
//                       programIds, timestamp.
//
// SigningResult       — Outcome of a policy evaluation.
//                       Fields: allowed, policyName, reason.
//
// EncryptedPayload    — Ciphertext + IV + salt stored in SQLite.
//                       Fields: ciphertext, iv, salt.
