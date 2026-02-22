// TrenchClaw — HD Key Derivation
//
// BIP44-compliant hierarchical deterministic key derivation for Solana.
// Derives multiple Ed25519 keypairs from a single BIP39 seed.
//
// Solana derivation path: m/44'/501'/account'/0'
//   - 44'  = BIP44 purpose
//   - 501' = Solana coin type (SLIP-0044)
//   - account' = incrementing index (0, 1, 2, ...)
//   - 0'   = change index (always 0 for Solana, hardened because Ed25519)
//
// Dependencies:
//   - bip39: mnemonic generation and seed derivation.
//   - micro-ed25519-hdkey: Ed25519 HD key derivation from seed.
//
// Interface:
//   generateMnemonic(strength?: 128 | 256): string
//     Returns a new 12-word (128) or 24-word (256) BIP39 mnemonic.
//
//   mnemonicToSeed(mnemonic: string, passphrase?: string): Uint8Array
//     Converts a mnemonic to a 64-byte seed.
//
//   deriveKeypair(seed: Uint8Array, index: number): { publicKey: Uint8Array, secretKey: Uint8Array }
//     Derives the Ed25519 keypair at m/44'/501'/{index}'/0' from the given seed.
//
//   derivationPath(index: number): string
//     Returns the string path for a given account index: "m/44'/501'/{index}'/0'"
//
// The output secretKey (64 bytes) is compatible with Solana Kit's
// createKeyPairSignerFromBytes() to produce a KeyPairSigner.
