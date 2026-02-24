// TrenchClaw — Wallet Store
//
// Persistent storage for wallets, accounts, policies, and signing logs.
// Uses the same Bun SQLite database as state-store.ts (adds new tables).
//
// Tables managed:
//   wallets          — Wallet records with encrypted key material.
//   wallet_accounts  — Derived accounts per wallet.
//   wallet_policies  — Signing policies per wallet.
//   signing_log      — Audit trail of every signing request and its policy result.
//
// Interface:
//   createWallet(wallet: Wallet): void
//   getWallet(id: string): Wallet | null
//   listWallets(): Wallet[]
//   updateWallet(id: string, updates: Partial<Wallet>): void
//   deleteWallet(id: string, hard?: boolean): void
//
//   createAccount(account: WalletAccount): void
//   getAccount(id: string): WalletAccount | null
//   getAccountByAddress(address: string): WalletAccount | null
//   listAccounts(walletId: string): WalletAccount[]
//   setDefaultAccount(walletId: string, accountId: string): void
//
//   createPolicy(policy: WalletPolicy): void
//   getPolicies(walletId: string): WalletPolicy[]
//   updatePolicy(id: string, updates: Partial<WalletPolicy>): void
//   deletePolicy(id: string): void
//
//   logSigning(entry: SigningLogEntry): void
//   getSigningHistory(walletId: string, limit?: number): SigningLogEntry[]
//   getSigningCountToday(walletId: string): number
//
// All writes are synchronous (Bun SQLite). Tables created on first boot.
