---
title: Swaps, Transfers, and Market Data
description: Use the real beta swap and research surfaces without confusing them with weaker or roadmap-only flows.
order: 6
---

## Shipped Surfaces

- managed-wallet Ultra swaps
- Jupiter Ultra quote and execution flows
- Dexscreener market-data queries
- direct Jupiter Trigger order flows

## Limited Beta Surfaces

- `transfer`
- `closeTokenAccount`
- `getSwapHistory`

These surfaces are wired, but they are not as strongly proven as the main wallet-read, Dexscreener, and Jupiter Ultra flows.

## Coming Soon

- `privacyTransfer`
- `privacyAirdrop`
- `privacySwap`
- broad autonomous strategy and trigger automation

## Live Swap Path

Jupiter Ultra is the current shipped swap path.

Exposed Ultra actions:

- `ultraQuoteSwap`
- `ultraExecuteSwap`
- `ultraSwap`
- `managedUltraSwap`

Standard or RPC swap files in the repo are not the current public swap path.

## Transfers

- `transfer`
- `closeTokenAccount`

Treat direct transfer flows as a narrower beta surface than Ultra swaps. Use them carefully and verify balances before and after execution.

## Devnet Airdrop

`devnetAirdrop` is for devnet testing, not general wallet funding.

## Swap History

`getSwapHistory` is available for recent swap activity on a wallet.

It uses Helius enhanced transaction history, so a Helius API key must be configured in the active instance vault.

This is useful for research and verification, but it is not one of the strongest headline beta surfaces yet.

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
- Helius vault credentials for `getSwapHistory`
- Jupiter Ultra API key for Ultra swaps and trigger orders

## Usage Notes

- use quote paths before execution when possible
- verify balances and recent history after high-impact actions
- use market-data and swap-history features for research and verification
- use `trenchclaw doctor` when a workflow depends on missing keys or CLI tooling
