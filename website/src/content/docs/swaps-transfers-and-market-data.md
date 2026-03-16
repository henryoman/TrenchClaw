---
title: Swaps, Transfers, and Market Data
description: Use the shipped execution and research features without confusing them with roadmap-only swap or trigger surfaces.
order: 6
---

## Shipped Surfaces

- direct transfers
- privacy transfer paths
- devnet airdrop
- Jupiter Ultra quote and execution flows
- managed-wallet Ultra swaps
- recent swap history
- Dexscreener market-data queries

## Live Swap Path

Jupiter Ultra is the current shipped swap path.

Exposed Ultra actions:

- `ultraQuoteSwap`
- `ultraExecuteSwap`
- `ultraSwap`
- `managedUltraSwap`
- `privacySwap`

Standard or RPC swap files in the repo are not the current public swap path.

## Transfers

- `transfer`
- `privacyTransfer`
- `privacyAirdrop`

## Devnet Airdrop

`devnetAirdrop` is for devnet testing, not general wallet funding.

## Swap History

`getSwapHistory` is available for recent swap activity on a wallet.

It uses Helius enhanced transaction history, so a Helius API key must be configured in the active instance vault.

## Dexscreener

Available market-data actions include:

- latest token profiles
- latest token boosts
- top token boosts
- paid order status
- pair search
- token pair lookups
- community takeover listings
- ads listings

This is research tooling, not execution tooling.

## Requirements

- trading being enabled
- wallet signing being allowed
- runtime notional limits
- confirmation settings for dangerous actions
- the currently active Ultra-related settings

## Usage Notes

- use quote paths before execution when possible
- verify balances and recent history after high-impact actions
- use market-data and swap-history features for research and verification
