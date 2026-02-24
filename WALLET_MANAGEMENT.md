# TrenchClaw Wallet Management Plan

This document defines TrenchClaw's wallet management architecture. The design is modeled after [Turnkey](https://turnkey.com)'s wallet infrastructure patterns — hierarchical wallets, policy-gated signing, multi-account derivation, import/export — but implemented locally using [`@solana/kit`](https://github.com/anza-xyz/kit) primitives instead of a hosted API.

No remote custody. No third-party signing service. All keys live on the operator's machine, encrypted at rest, policy-gated at runtime.

---

## What Turnkey Does (and What We Take From It)

[Turnkey](https://docs.turnkey.com) is a wallet-as-a-service platform. At its core:

- **Hierarchical organization.** A parent org contains sub-organizations. Each sub-org owns wallets. Each wallet derives multiple accounts via HD paths.
- **Policy engine.** Every signing request is evaluated against JSON-defined policies before execution. Policies specify who can sign, with which wallet, to which address, under what conditions. Deny always overrides allow.
- **Signer abstraction.** Turnkey wraps signing behind a `TurnkeySigner` that plugs into web3 libraries. The app never touches raw private keys.
- **HD derivation.** One seed generates many accounts via BIP44 paths (`m/44'/501'/n'/0'` for Solana). Add a new trading wallet without importing a new key.
- **Import/export.** Bring in existing wallets via mnemonic or base58 private key. Export keys out if you want to leave.
- **Activity logging.** Every signing event is an "activity" with metadata, timestamp, and policy evaluation result.

TrenchClaw takes all of these concepts and implements them locally, on-device, with Solana Kit's native `KeyPairSigner` and `CryptoKeyPair` instead of Turnkey's hosted enclaves.

---

## Architecture

### Where it lives

```
src/
  solana/
    wallet/
      index.ts              # Barrel export
      wallet-manager.ts     # Core wallet lifecycle (create, derive, import, export, list, delete)
      wallet-store.ts       # Encrypted wallet persistence (Bun SQLite)
      wallet-signer.ts      # Signer factory: returns KeyPairSigner from wallet ID
      wallet-policy.ts      # Per-wallet signing policies (evaluated before every sign)
      wallet-types.ts       # Wallet, WalletAccount, WalletPolicy, SigningRequest types
      hd-derivation.ts      # BIP44 HD key derivation for Solana (m/44'/501'/n'/0')
      encryption.ts         # AES-256-GCM encryption/decryption for key material at rest
```

### How it connects to the runtime

```
Action needs to sign
        │
        ▼
  Dispatcher calls wallet-signer.getSigner(walletId)
        │
        ▼
  wallet-policy evaluates signing request against wallet's policies
        │  (if denied → emit policy:block event, abort)
        ▼
  wallet-signer returns KeyPairSigner from decrypted CryptoKeyPair
        │
        ▼
  Action uses Kit's signTransactionMessageWithSigners()
        │
        ▼
  wallet-store logs signing activity (receipt)
```

Actions never see raw private keys. They receive a `KeyPairSigner` (Solana Kit's native signer type) and pass it to `signTransactionMessageWithSigners()`. The wallet layer handles everything else.

---

## Core Concepts

### Wallet

A wallet is a named container that holds a seed or a single keypair. It can derive multiple accounts.

```typescript
interface Wallet {
  id: string;
  name: string;
  type: "hd" | "imported";
  createdAt: number;
  // For HD wallets: encrypted seed (AES-256-GCM)
  encryptedSeed?: string;
  // For imported wallets: encrypted base58 private key
  encryptedPrivateKey?: string;
  // Derivation index counter (HD wallets only)
  nextDerivationIndex?: number;
  // Active policies applied to this wallet
  policies: WalletPolicy[];
}
```

### Wallet Account

An account is a single Solana address derived from a wallet. HD wallets can have many accounts. Imported wallets have exactly one.

```typescript
interface WalletAccount {
  id: string;
  walletId: string;
  label?: string;
  address: string;           // Solana base58 address
  derivationPath?: string;   // e.g. "m/44'/501'/0'/0'" (HD only)
  derivationIndex?: number;  // e.g. 0, 1, 2 (HD only)
  isDefault: boolean;        // One account per wallet is the default signer
  createdAt: number;
}
```

### Wallet Policy

Policies are evaluated before every signing request. Modeled after Turnkey's policy engine.

```typescript
interface WalletPolicy {
  id: string;
  walletId: string;
  effect: "allow" | "deny";
  name: string;
  conditions: PolicyCondition[];
}

type PolicyCondition =
  | { type: "maxAmountPerTx"; lamports: bigint }
  | { type: "maxAmountPerDay"; lamports: bigint }
  | { type: "allowedDestinations"; addresses: string[] }
  | { type: "blockedDestinations"; addresses: string[] }
  | { type: "allowedPrograms"; programIds: string[] }
  | { type: "blockedPrograms"; programIds: string[] }
  | { type: "maxTransactionsPerDay"; count: number }
  | { type: "requireConfirmation"; enabled: boolean }
  | { type: "timeWindow"; startHour: number; endHour: number }
  | { type: "cooldownSeconds"; seconds: number };
```

### Signing Request

Every time an action needs to sign, it goes through a signing request that gets evaluated against policies.

```typescript
interface SigningRequest {
  walletId: string;
  accountId: string;
  actionName: string;         // Which action is requesting the signature
  jobId?: string;             // Which bot/job triggered it
  transactionMessage: object; // The Kit transaction message to sign
  estimatedLamports?: bigint; // Estimated value being moved
  destination?: string;       // Target address if applicable
  programIds?: string[];      // Programs being invoked
  timestamp: number;
}
```

---

## Wallet Operations

### Create HD Wallet

Generate a new BIP39 mnemonic (12 or 24 words), derive the master seed, encrypt it with AES-256-GCM using a passphrase, store in SQLite. Derive the first account at `m/44'/501'/0'/0'` and set it as default.

Uses: `bip39` for mnemonic generation, `micro-ed25519-hdkey` for HD derivation, Web Crypto API for AES encryption, Solana Kit's `createKeyPairSignerFromBytes()` for the final signer.

### Derive New Account

From an existing HD wallet, increment the derivation index, derive at `m/44'/501'/n'/0'`, store the new account. Each account gets its own Solana address. The wallet seed stays the same.

This is how operators run multiple bots with separate wallets from one seed — same pattern as Turnkey's sub-org model but local.

### Import Wallet

Accept a base58 private key or a BIP39 mnemonic. Encrypt and store. If mnemonic, treat as HD wallet (can derive accounts). If raw key, treat as single-account imported wallet.

Uses Solana Kit's `createKeyPairFromBytes()` to reconstruct the `CryptoKeyPair` from the imported key material.

### Export Wallet

Decrypt the seed or private key and return it. Requires the operator's passphrase. Logged as an activity. This is the escape hatch — operator can always extract their keys and leave.

### Delete Wallet

Soft-delete (mark as deleted, retain encrypted data for a configurable period) or hard-delete (wipe key material). Requires confirmation. Any active bots using this wallet are stopped first.

### List Wallets

Return all wallets with their accounts, balances (cached), policy summaries, and active bot associations. Feeds the TUI wallet view.

---

## Signer Factory

The signer factory is the single point where key material is decrypted and a `KeyPairSigner` is produced. Nothing else in the system has access to raw keys.

```
wallet-signer.getSigner(walletId, accountId?)
  1. Load wallet + account from wallet-store
  2. Decrypt seed or private key using operator passphrase (cached in memory for session)
  3. If HD: derive the specific account's keypair from seed + derivation path
  4. Construct CryptoKeyPair from raw bytes
  5. Return KeyPairSigner via Kit's createKeyPairSignerFromBytes()
```

The returned `KeyPairSigner` implements both `MessagePartialSigner` and `TransactionPartialSigner` from Solana Kit. Actions pass it directly to `setTransactionMessageFeePayerSigner()` and `signTransactionMessageWithSigners()`. No conversion. No legacy `Keypair` objects.

---

## Policy Evaluation

Before every signing request:

```
1. Collect all policies for the wallet (allow + deny)
2. For each policy, evaluate all conditions against the SigningRequest
3. If ANY deny policy matches → block (deny always wins, same as Turnkey)
4. If NO allow policy matches → block (implicit deny by default)
5. If at least one allow matches and no deny matches → proceed
6. Log the policy evaluation result to state-store (policy_hits table)
7. Emit policy:block event if blocked
```

### Example policies

**Bot wallet: allow swaps only, max 1 SOL per tx, only through Jupiter**
```json
[
  {
    "effect": "allow",
    "name": "allow-jupiter-swaps",
    "conditions": [
      { "type": "allowedPrograms", "programIds": ["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"] },
      { "type": "maxAmountPerTx", "lamports": 1000000000 }
    ]
  },
  {
    "effect": "deny",
    "name": "block-direct-transfers",
    "conditions": [
      { "type": "blockedPrograms", "programIds": ["11111111111111111111111111111111"] }
    ]
  }
]
```

**Cold wallet: deny everything except manual operator actions**
```json
[
  {
    "effect": "deny",
    "name": "deny-automated-signing",
    "conditions": []
  }
]
```

**Sniper wallet: high limit, time-restricted, cooldown between trades**
```json
[
  {
    "effect": "allow",
    "name": "allow-sniper-trades",
    "conditions": [
      { "type": "maxAmountPerTx", "lamports": 5000000000 },
      { "type": "timeWindow", "startHour": 8, "endHour": 22 },
      { "type": "cooldownSeconds", "seconds": 30 },
      { "type": "maxTransactionsPerDay", "count": 50 }
    ]
  }
]
```

---

## Storage

All wallet data persists in Bun SQLite (same `state-store.ts` database, new tables).

### Tables

```sql
wallets
  id                TEXT PRIMARY KEY
  name              TEXT
  type              TEXT ('hd' | 'imported')
  encrypted_seed    TEXT (nullable, AES-256-GCM ciphertext)
  encrypted_key     TEXT (nullable, AES-256-GCM ciphertext)
  next_deriv_index  INTEGER (nullable)
  created_at        INTEGER
  deleted_at        INTEGER (nullable, soft delete)

wallet_accounts
  id                TEXT PRIMARY KEY
  wallet_id         TEXT REFERENCES wallets(id)
  label             TEXT (nullable)
  address           TEXT
  derivation_path   TEXT (nullable)
  derivation_index  INTEGER (nullable)
  is_default        INTEGER (0|1)
  created_at        INTEGER

wallet_policies
  id                TEXT PRIMARY KEY
  wallet_id         TEXT REFERENCES wallets(id)
  name              TEXT
  effect            TEXT ('allow' | 'deny')
  conditions        TEXT (JSON)
  created_at        INTEGER
  enabled           INTEGER (0|1)

signing_log
  id                TEXT PRIMARY KEY
  wallet_id         TEXT
  account_id        TEXT
  action_name       TEXT
  job_id            TEXT (nullable)
  policy_result     TEXT ('allowed' | 'denied')
  policy_name       TEXT (nullable, which policy decided)
  destination       TEXT (nullable)
  estimated_amount  INTEGER (nullable, lamports)
  tx_signature      TEXT (nullable)
  created_at        INTEGER
```

---

## Encryption

Key material is never stored in plaintext.

- **Algorithm:** AES-256-GCM via Web Crypto API (native to Bun runtime)
- **Key derivation:** PBKDF2 from operator passphrase + random salt (100K iterations, SHA-256)
- **Per-wallet IV:** Each wallet gets a unique random 12-byte IV
- **Passphrase caching:** Decrypted passphrase-derived key is held in memory for the runtime session. Cleared on shutdown.
- **No plaintext on disk.** Ever. The SQLite database contains only ciphertext.

This mirrors Turnkey's TEE model conceptually (keys are only decrypted in the execution context) but runs locally instead of in AWS Nitro Enclaves.

---

## Multi-Wallet Strategy for Bots

Inspired by Turnkey's sub-organization model where each user/purpose gets isolated wallets:

| Wallet | Purpose | Policy |
|---|---|---|
| `operator` | Manual commands, emergency transfers | No automated signing. Operator passphrase required per action. |
| `dca-bot` | DCA routine wallet | Allow Jupiter swaps only. Max 0.5 SOL/tx. Max 10 tx/day. |
| `swing-bot` | Swing routine wallet | Allow Jupiter swaps. Max 2 SOL/tx. Cooldown 60s. |
| `sniper-bot` | Sniper routine wallet | Allow Jupiter swaps. Max 5 SOL/tx. Time window 8am-10pm. Max 50 tx/day. |
| `cold` | Long-term holds | Deny everything. Export-only. |

Each bot's config references a `walletId`. The scheduler creates an `ActionContext` with that wallet's signer. The dispatcher evaluates that wallet's policies before every signing request. Complete isolation between bots.

If one bot wallet is compromised or misbehaves, the others are unaffected. Same principle as Turnkey's sub-org isolation.

---

## Integration With Existing Architecture

| Component | How it connects |
|---|---|
| `src/ai/context.ts` | `ActionContext` holds a `walletId` + `accountId`. The signer is resolved lazily via `wallet-signer.getSigner()`. |
| `src/ai/dispatcher.ts` | Before calling `action.execute()`, dispatcher calls `wallet-policy.evaluate(signingRequest)`. If denied, action is aborted. |
| `src/ai/policy-engine.ts` | The existing policy engine delegates wallet-specific policies to `wallet-policy.ts`. Trade policies (slippage, liquidity) stay in the policy engine. Signing policies live with the wallet. |
| `src/ai/state-store.ts` | Wallet tables (`wallets`, `wallet_accounts`, `wallet_policies`, `signing_log`) are added to the same SQLite database. Same migration pattern. |
| `src/ai/event-bus.ts` | New events: `wallet:created`, `wallet:deleted`, `wallet:policy-block`, `wallet:signing-success`. |
| `src/solana/actions/` | Actions receive a `KeyPairSigner` from context. They call Kit's `signTransactionMessageWithSigners()`. They never import wallet internals. |
| `src/apps/cli/views/` | New TUI view: `wallets.ts` — list wallets, show accounts, balances, policy summaries, signing history. |
| `src/solana/routines/` | Each routine's `BotConfig` references a `walletId`. Different bots can use different wallets. |

---

## What We Don't Take From Turnkey

| Turnkey feature | Why we skip it |
|---|---|
| Remote hosted enclaves (TEE) | TrenchClaw runs locally. Encryption at rest + in-memory decryption is sufficient for single-operator use. |
| Sub-organizations | Replaced by local multi-wallet with per-wallet policies. Same isolation, no org hierarchy needed. |
| Social login / passkeys / email auth | TrenchClaw is a CLI tool for operators, not a consumer wallet. Passphrase-based access is appropriate. |
| Embedded wallet UI kit (React) | We use OpenTUI. No browser. No React components. |
| Multi-chain support | Solana only. |
| Gas sponsorship / abstraction | Solana doesn't have gas abstraction in the same way. Priority fees are handled in the Jupiter adapter. |

---

## Implementation Order

1. `wallet-types.ts` — Define all interfaces.
2. `encryption.ts` — AES-256-GCM encrypt/decrypt with PBKDF2 key derivation.
3. `hd-derivation.ts` — BIP44 Solana derivation (`m/44'/501'/n'/0'`).
4. `wallet-store.ts` — SQLite tables, CRUD for wallets/accounts/policies.
5. `wallet-manager.ts` — Create, derive, import, export, delete operations.
6. `wallet-signer.ts` — Signer factory: wallet ID → `KeyPairSigner`.
7. `wallet-policy.ts` — Policy evaluation engine for signing requests.
8. Wire into `context.ts`, `dispatcher.ts`, and `event-bus.ts`.
9. Add `wallets` TUI view.
10. Add CLI commands: `wallet create`, `wallet list`, `wallet import`, `wallet export`, `wallet policy`.
