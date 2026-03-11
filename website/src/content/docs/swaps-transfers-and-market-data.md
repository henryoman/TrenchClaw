---
title: Swaps, Transfers, and Market Data
description: Document the currently exposed execution and research surfaces without overstating roadmap-only swap paths or trigger systems.
order: 6
---

This page covers the execution and research capabilities that are actually exposed in the current runtime catalog.

## What Is Clearly Shipped

The runtime exposes operator-facing actions for:

- direct transfers
- privacy transfer paths
- devnet airdrop
- Jupiter Ultra quote and execution flows
- managed-wallet Ultra swaps
- recent swap history
- Dexscreener market-data queries

## Ultra Is The Live Swap Path

Current public docs should describe Jupiter Ultra as the active shipped swap path.

Exposed Ultra surfaces include:

- `ultraQuoteSwap`
- `ultraExecuteSwap`
- `ultraSwap`
- `managedUltraSwap`
- `privacySwap`

## Standard RPC Swap Path Is Not A Shipped Public Feature

There are placeholder files for a standard or RPC-based swap flow in the repo, but that path is not the one the current runtime exposes publicly.

Document it as not yet shipped for operators rather than as a supported alternate swap mode.

## Transfers

Transfer execution depends on runtime settings and signing permissions.

Current transfer-style surfaces include:

- `transfer`
- `privacyTransfer`
- `privacyAirdrop`

These are high-impact actions and should be described as gated by runtime settings and confirmation behavior, not as always-on buttons.

## Devnet Airdrop

`devnetAirdrop` is useful for:

- testing managed wallet setups
- validating sequences without live funds
- dry-running wallet workflows on devnet

Treat it as a devnet testing feature, not a general funding mechanism.

## Swap History

The runtime exposes `getSwapHistory`, which pulls recent Solana swap activity for a wallet through the Helius-backed path.

That is useful for:

- verifying recent execution
- checking whether swaps actually landed
- building runtime summaries and operator context

## Dexscreener And Market Data

The current catalog also exposes a meaningful Dexscreener surface:

- latest token profiles
- latest token boosts
- top token boosts
- paid order status
- pair search
- token pair lookups
- community takeover listings
- ads listings

This is research tooling, not execution tooling.

## Confirmation And Policy Notes

Many transfer and swap paths are not simply "on" or "off". They depend on:

- trading being enabled
- wallet signing being allowed
- runtime notional limits
- confirmation settings for dangerous actions
- the currently active Ultra-related settings

## What To Say Publicly

Good public summary:

- TrenchClaw currently ships an Ultra-centered swap path plus transfer, airdrop, history, and market-data surfaces.

Bad public summary:

- claiming full generic Jupiter swap parity
- claiming trigger-driven strategy automation from these primitives alone
- implying that every exposed action is equally tested or equally GUI-driven

## Operator Guidance

- use quote paths before execution when possible
- verify balances and recent history after high-impact actions
- treat market-data and swap-history features as research and verification aids, not guarantees of execution quality
