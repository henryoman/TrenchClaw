// TrenchClaw — Wallet Manager
//
// High-level wallet lifecycle operations. This is what the CLI and TUI call.
// Delegates to wallet-store for persistence, encryption for key material,
// and hd-derivation for account derivation.
//
// Operations:
//
//   createHdWallet(name: string, passphrase: string, mnemonicStrength?: 128 | 256): Wallet
//     1. Generate BIP39 mnemonic.
//     2. Derive seed from mnemonic.
//     3. Encrypt seed with passphrase via encryption module.
//     4. Store encrypted wallet in wallet-store.
//     5. Derive first account at m/44'/501'/0'/0', set as default.
//     6. Return wallet (mnemonic shown once to operator, then never stored plaintext).
//
//   importFromMnemonic(name: string, mnemonic: string, passphrase: string): Wallet
//     Same as createHdWallet but uses the provided mnemonic instead of generating one.
//
//   importFromPrivateKey(name: string, base58Key: string, passphrase: string): Wallet
//     1. Decode base58 private key to bytes.
//     2. Encrypt with passphrase.
//     3. Store as type "imported" (single account, no HD derivation).
//     4. Derive address from public key, create single account.
//
//   deriveNextAccount(walletId: string, label?: string): WalletAccount
//     1. Load wallet (must be type "hd").
//     2. Decrypt seed.
//     3. Derive keypair at m/44'/501'/{nextIndex}'/0'.
//     4. Increment nextDerivationIndex.
//     5. Store new account.
//
//   exportWallet(walletId: string, passphrase: string): { mnemonic?: string, privateKey?: string }
//     1. Verify passphrase can decrypt key material.
//     2. Return mnemonic (HD) or base58 private key (imported).
//     3. Log export event.
//
//   deleteWallet(walletId: string, hard?: boolean): void
//     1. Check no active bots reference this wallet. If so, stop them first.
//     2. Soft-delete (set deleted_at) or hard-delete (wipe key material).
//     3. Remove associated accounts and policies.
//
//   listWallets(): WalletSummary[]
//     Return all wallets with account count, default address, policy count,
//     and active bot associations.
//
//   setWalletPolicies(walletId: string, policies: WalletPolicy[]): void
//     Replace all policies for a wallet. Validates policy structure.
