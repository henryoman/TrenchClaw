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
