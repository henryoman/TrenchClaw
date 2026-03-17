# Wallet Reference

## Purpose

This file explains the current managed-wallet layout, discovery rules, and safe wallet operation paths.

## Wallet Scope And Storage

Managed wallets are scoped to the active runtime instance.

Default wallet root:

- `.runtime-state/instances/<id>/keypairs/`

Current layout under that root:

- one flat directory per wallet group
- one wallet keypair JSON file per wallet inside the group directory
- one `*.label.json` sidecar file next to each wallet keypair file
- one wallet library index file: `wallet-library.jsonl`

Example shape:

- `.runtime-state/instances/<id>/keypairs/wallet-library.jsonl`
- `.runtime-state/instances/<id>/keypairs/core-wallets/wallet_000.json`
- `.runtime-state/instances/<id>/keypairs/core-wallets/wallet_000.label.json`
- `.runtime-state/instances/<id>/keypairs/snipers/wallet_000.json`

The default wallet library path can be overridden with:

- `TRENCHCLAW_WALLET_LIBRARY_FILE`

That path still must stay under protected runtime roots.

## Wallet File Shapes

- wallet keypair files are JSON arrays of integers
- `createWallets` currently writes 64 integers: 32 private key bytes plus 32 public key bytes
- the managed-wallet signer accepts either 32 or 64 integers and uses the first 32 bytes as the private key
- label files are JSON objects with `version`, `walletId`, `walletGroup`, `walletName`, `address`, `walletFileName`, `createdAt`, and `updatedAt`
- the library file is JSONL, one wallet record per line
- wallet IDs are derived as `<walletGroup>.<walletName>`

## Wallet Source Of Truth

The preferred index is `wallet-library.jsonl`.

Each library entry records:

- `walletId`
- `walletGroup`
- `walletName`
- `address`
- `keypairFilePath`
- `walletLabelFilePath`
- `createdAt`
- `updatedAt`

Fallback discovery rule:

- if the library file is missing, runtime can infer managed wallets from `*.label.json` files under the keypair root
- `getManagedWalletContents` and `getManagedWalletSolBalances` also fall back when the library exists but is empty
- prompt wallet context rendering and managed-wallet lookup helpers use label-file inference when the library file is missing
- reads can report `invalidLibraryLineCount`
- `renameWallets` refuses to rewrite a library that contains invalid lines

## Naming Rules And Limits

- wallet groups and wallet names must match `^[a-zA-Z0-9_-]+$`
- wallet groups are single-level names only
- no slashes or nested group paths
- `walletId` allows dots because it is derived as `group.name`
- `createWallets` supports up to 25 groups per call
- each wallet group supports at most 100 wallet files
- if wallet names are omitted, default names are `wallet_000`, `wallet_001`, `wallet_002`, and so on
- wallet filenames are allocated by the next free numeric slot in that group directory and do not need to match the wallet label exactly

## Allowed Mutation Paths

Use runtime actions:

- `createWallets`
- `renameWallets`
- `createWalletGroupDirectory` when a group directory must exist before other work, though `createWallets` already creates missing group directories

Current mutation behavior:

- `createWallets` writes new keypair files, new label files, and appends new lines to `wallet-library.jsonl`
- `renameWallets` updates wallet organization metadata only
- `renameWallets` rewrites `wallet-library.jsonl` and updates `*.label.json` sidecars
- `renameWallets` does not rename keypair filenames
- `renameWallets` does not change secret key bytes or wallet addresses
- there is no wallet delete tool in chat
- internal deletion is blocked for `actor="agent"` and requires `actor="user"` plus explicit approval

## Model Operating Rule

- read wallet state before mutation
- treat wallet organization as protected state
- prefer runtime actions over manual file edits
- never edit vaults, keypair files, `wallet-library.jsonl`, or `*.label.json` directly with file tools
- if the user refers to a managed wallet, identify it by `walletGroup` plus `walletName`
- signing actions resolve managed wallets from managed-wallet metadata, with label-file fallback when the library file is missing
- use `getManagedWalletContents` for full holdings
- use `getManagedWalletSolBalances` when only SOL balances are needed

## Managed Wallet Contents

`getManagedWalletContents` is the main holdings read for managed wallets.

- returns SOL plus fungible token balances for each managed wallet
- supports optional filters: `instanceId`, `walletGroup`, `walletNames`, `includeZeroBalances`
- reports whether wallets were discovered via `wallet-library` or `label-files`
- aggregates token totals across the selected wallet set
- prefers Helius DAS when Helius is the selected private RPC
- otherwise uses raw RPC batch reads
- can fall back from RPC batch reads to sequential RPC reads after retryable RPC failures or public RPC rate limits
- Helius-backed reads can include token symbol/name/image metadata, USD pricing, and collectible counts
- returns wallet-level `pricedTokenTotalUsd`, aggregate `totalPricedTokenUsd`, and aggregate `totalCollectibleCount`

## SOL-Only Balance Read

`getManagedWalletSolBalances` is the faster SOL-only read.

- uses the same wallet discovery rules as `getManagedWalletContents`
- supports optional `instanceId`, `walletGroup`, and `walletNames` filters
- returns wallet-level SOL balances plus aggregate SOL totals

## Signing Paths

Managed-wallet signing actions load the signer by `walletGroup` and `walletName`.

Current examples:

- `transfer`
- `closeTokenAccount`
- `managedUltraSwap`
- managed Jupiter Trigger order actions

Do not route signing flows through direct keypair-file edits or ad hoc file discovery when a managed-wallet reference exists.
