# Wallet Playbook

Use this file when the user asks about wallet creation, wallet naming, balances,
wallet selection, transfers, or keypair-related workflow and you want the
shortest repo-authored guide.

## Create Wallets

- default tool: `createWallets`
- use when the user asks to create one or more managed wallets
- prefer clear wallet names if the user gives them

## Rename Wallets

- default tool: `renameWallets`
- use when the user wants cleaner wallet labels or naming cleanup

## Read Wallet Balances And Holdings

- `getManagedWalletSolBalances`
  - use for SOL balance snapshots across wallets
- `getManagedWalletContents`
  - use for token holdings and fuller wallet inventory

## Transfer Funds

- default tool: `transfer`
- use when the user clearly asks to send SOL or tokens
- resolve the wallet first if the wallet selection is ambiguous

## Privacy Flows

- `privacyTransfer`
  - use for privacy-oriented transfer flow when the user explicitly wants it
- `privacyAirdrop`
  - use for privacy airdrop setup or testing flow when applicable

## Key Safety Rules

- do not manually edit wallet keypair files
- do not read vault secrets through normal file tools
- prefer runtime wallet actions over raw shell commands
- if wallet identity is ambiguous, resolve it before any mutation

## If You Need More Detail

- open `wallet-reference` for wallet organization and signing guidance
- open `runtime-reference` for runtime safety and filesystem boundaries
