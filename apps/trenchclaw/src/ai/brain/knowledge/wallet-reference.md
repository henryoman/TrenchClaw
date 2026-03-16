# Wallet Reference

## Purpose

This file explains the wallet layout and the safe way to work with it.

## Wallet Storage

Wallet files live under:

- `.runtime-state/instances/<id>/keypairs/`

Important files:

- wallet keypair files: `*.json`
- wallet label files: `*.label.json`
- wallet library file: `wallet-library.jsonl`

## Wallet Source Of Truth

The wallet library is the index for managed wallets.

It records:

- `walletId`
- `walletGroup`
- `walletName`
- `address`
- `keypairFilePath`
- `walletLabelFilePath`

## Allowed Mutation Paths

Use runtime actions:

- `createWallets`
- `renameWallets`

Do not hand-edit:

- `wallet-library.jsonl`
- `*.label.json`
- keypair files

## Naming Rules

- wallet groups are flat names
- wallet names are flat names
- no nested group paths
- no direct file rewrites unless explicitly required by a tool contract

## Model Operating Rule

- read wallet state before mutation
- treat wallet organization as protected state
- prefer runtime actions over manual file edits
- use `getManagedWalletContents` for full holdings
- use `getManagedWalletSolBalances` when only SOL balances are needed

## Managed Wallet Contents

`getManagedWalletContents` is the main holdings read for managed wallets.

- returns SOL plus fungible token balances for each managed wallet
- aggregates token totals across the selected wallet set
- prefers Helius DAS when Helius is the selected private RPC
- falls back to raw `getBalance` + `getTokenAccountsByOwner` reads when Helius is not the active provider
- Helius-backed reads can include token symbol/name/image metadata, USD pricing, and collectible counts
