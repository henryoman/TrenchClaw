---
title: Wallet Management
description: Manage instance-scoped wallets, understand the current filesystem layout, and know what the GUI does today.
order: 4
---

## Wallet Layout

- each active instance has its own wallet root
- managed keypairs live under the instance's protected keypair area
- wallet groups are flat directories
- wallet metadata is tracked with JSONL library entries and label sidecars

## GUI Support

- browsing the managed wallet tree
- downloading wallet backup JSON files

The GUI does not currently provide a full wallet create or rename flow.

## Wallet Actions

- `createWalletGroupDirectory`
- `createWallets`
- `renameWallets`
- `getManagedWalletContents`
- `getManagedWalletSolBalances`

`createWallets` supports:

- explicit wallet names
- a count that produces simple default names such as `wallet_000`

## Backup Download

- only JSON wallet files are downloadable
- the requested path is constrained to stay inside the wallet root
- label sidecars are not treated as primary wallet backup files

## Instance Requirement

Wallet access depends on an active instance.

## Wallet Contents Reads

`getManagedWalletContents` is the main holdings read for managed wallets.

- returns per-wallet SOL balances plus fungible token balances
- aggregates totals across the selected wallet set
- when Helius is the selected private RPC, it prefers Helius DAS for richer token metadata, price data, and collectible counts
- when Helius is not selected, it falls back to raw Solana RPC balance and token-account reads

`getManagedWalletSolBalances` is the lightweight SOL-only alternative when you do not need token details.

## Operational Tips

- confirm the active instance before creating or downloading wallets
- treat downloaded JSON backup files as sensitive material
- keep wallet organization simple and flat by group, because that matches the current runtime contract
- for rich holdings output, configure Helius as the selected private RPC before asking for wallet contents
