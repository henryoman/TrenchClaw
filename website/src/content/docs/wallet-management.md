---
title: Wallet Management
description: Understand the managed-wallet filesystem model, what the GUI supports today, and where wallet creation and rename flows currently live.
order: 4
---

Managed wallets are scoped to the active instance and stored in the protected instance directory.

## Wallet Layout

Current wallet handling is filesystem-backed.

Important pieces:

- each active instance has its own wallet root
- managed keypairs live under the instance's protected keypair area
- wallet groups are flat directories
- wallet metadata is tracked with JSONL library entries and label sidecars

## What The GUI Supports Today

The shipped GUI currently supports:

- browsing the managed wallet tree
- counting discovered wallet JSON files
- downloading wallet backup JSON files

The GUI does not currently expose a full dedicated create-wallet or rename-wallet workflow.

## Where Creation And Rename Happen

Wallet creation and rename are real runtime capabilities, but they are action-driven rather than fully GUI-driven.

Current shipped action surfaces include:

- `createWalletGroupDirectory`
- `createWallets`
- `renameWallets`

These are the surfaces to think about when documenting actual operator capability.

## Managed Wallet Creation Model

`createWallets` supports grouped creation with either:

- explicit wallet names
- a count that produces default names such as `wallet_00`

This is useful for:

- creating a small group of named operator wallets
- provisioning repeated test wallets quickly
- preparing wallets for later action-sequence routines

## Rename Model

Wallet renames are explicit edits from one `walletGroup` and `walletName` pair to another.

That means the current runtime model is oriented around:

- deliberate organization updates
- filesystem-backed grouping
- preserving secret key material while changing labels and organization

## Backup Download

The GUI can download wallet backup JSON files from the managed wallet tree.

Current runtime behavior:

- only JSON wallet files are downloadable
- the requested path is constrained to stay inside the wallet root
- label sidecars are not treated as primary wallet backup files

## Instance Dependency

Wallet access depends on an active instance.

If no active instance is selected, wallet operations that need the managed root should fail rather than guessing a global wallet namespace.

## What To Document Conservatively

Safe public claims:

- managed wallets are local and instance-scoped
- wallet groups are directory-backed
- the runtime supports wallet creation and rename actions
- the GUI supports wallet browsing and backup download

Claims to avoid:

- implying that the GUI already has a complete point-and-click wallet management suite
- implying that wallet deletion is a normal agent flow

## Operational Tips

- confirm the active instance before creating or downloading wallets
- treat downloaded JSON backup files as sensitive material
- keep wallet organization simple and flat by group, because that matches the current runtime contract
