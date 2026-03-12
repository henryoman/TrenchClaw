// TrenchClaw — Wallet Encryption
//
// Encrypts and decrypts wallet key material at rest using AES-256-GCM.
// Uses the Web Crypto API native to the Bun runtime (no external deps).
//
// Key derivation:
//   - PBKDF2 from user passphrase + random 16-byte salt.
//   - 100,000 iterations, SHA-256 hash.
//   - Produces a 256-bit AES key.
//
// Encryption:
//   - AES-256-GCM with a unique random 12-byte IV per encrypt call.
//   - Returns EncryptedPayload { ciphertext, iv, salt } (all base64-encoded for SQLite storage).
//
// Decryption:
//   - Accepts EncryptedPayload + user passphrase.
//   - Re-derives AES key via PBKDF2 using stored salt.
//   - Decrypts ciphertext using stored IV.
//   - Returns raw bytes (Uint8Array) of seed or private key.
//
// Passphrase caching:
//   - The derived AES key is cached in-memory for the runtime session.
//   - Cleared on process exit (SIGINT/SIGTERM handler).
//   - User enters passphrase once at boot, not per-sign.
//
// Interface:
//   encrypt(plaintext: Uint8Array, passphrase: string): Promise<EncryptedPayload>
//   decrypt(payload: EncryptedPayload, passphrase: string): Promise<Uint8Array>
//   clearCache(): void
