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

`createWallets` supports:

- explicit wallet names
- a count that produces default names such as `wallet_00`

## Backup Download

- only JSON wallet files are downloadable
- the requested path is constrained to stay inside the wallet root
- label sidecars are not treated as primary wallet backup files

## Instance Requirement

Wallet access depends on an active instance.

## Operational Tips

- confirm the active instance before creating or downloading wallets
- treat downloaded JSON backup files as sensitive material
- keep wallet organization simple and flat by group, because that matches the current runtime contract
