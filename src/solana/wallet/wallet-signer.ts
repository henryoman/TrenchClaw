// TrenchClaw — Wallet Signer Factory
//
// The single point where encrypted key material is decrypted and a
// Solana Kit KeyPairSigner is produced. Nothing else in the system
// touches raw private keys.
//
// Interface:
//   getSigner(walletId: string, accountId?: string): Promise<KeyPairSigner>
//     1. Load wallet from wallet-store.
//     2. Decrypt seed or private key using cached passphrase.
//     3. If HD wallet: derive the specific account's keypair from seed + derivation path.
//     4. If imported wallet: use the decrypted private key directly.
//     5. Construct CryptoKeyPair from raw bytes via Web Crypto API.
//     6. Return KeyPairSigner via Solana Kit's createKeyPairSignerFromBytes().
//
// The returned KeyPairSigner implements:
//   - MessagePartialSigner (for signing off-chain messages)
//   - TransactionPartialSigner (for signing transactions)
//
// Actions use the signer with:
//   - setTransactionMessageFeePayerSigner(signer, tx)
//   - signTransactionMessageWithSigners(tx)
//
// Caching:
//   - Passphrase-derived AES key is cached in memory (from encryption module).
//   - Derived CryptoKeyPair objects are cached per (walletId, accountId) for the session.
//   - Cache is cleared on shutdown.
//
// This module is the security boundary. If you audit one file, audit this one.
