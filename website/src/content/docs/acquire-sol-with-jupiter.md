---
title: Funding Wallets
description: Fund wallets for real use or devnet testing, and understand which funding paths are external guidance versus product-native runtime actions.
order: 5
---

This guide covers the funding paths that matter for TrenchClaw usage today.

## Two Different Funding Cases

### Real Funds

For mainnet-style usage, TrenchClaw does not currently provide a fiat onramp inside the product. You fund wallets externally, then use TrenchClaw once assets are already available.

### Test Funds

For devnet testing, TrenchClaw does expose a devnet SOL airdrop action surface.

## Mainnet Funding Path

If you need real SOL before using live runtime features:

1. Fund a wallet externally.
2. Confirm the wallet address is the one you intend to operate with.
3. Verify the wallet holds enough SOL for network fees and the action you want to test.

Common external path:

- use Jupiter's public site for onramp or token swaps when that fits your region and account setup

That is external operator guidance, not an embedded TrenchClaw workflow.

## Devnet Funding Path

The runtime exposes a `devnetAirdrop` action for confirmed SOL airdrops on Solana devnet.

What it is useful for:

- testing managed wallet flows
- testing routines against disposable balances
- validating queueing and action wiring without mainnet funds

## Before Funding Any Wallet

Confirm:

- you are in the correct instance
- you know whether you are operating on devnet or mainnet-style infrastructure
- the wallet you are funding is the wallet you actually intend to use
- you are keeping extra SOL available for fees

## External Jupiter Guidance

If you use Jupiter outside TrenchClaw to fund a wallet:

1. Verify the URL is `https://jup.ag`.
2. Use the wallet address you intend to use with TrenchClaw.
3. Wait for settlement and final confirmation.
4. Recheck balances before running runtime actions.

## Current Product Boundary

Document this boundary clearly:

- buying or onramping fiat is outside the current product
- devnet airdrop is inside the current action surface
- swap execution inside TrenchClaw is a separate runtime capability and not the same thing as funding from fiat

## Verify Before Continuing

- the asset is visible in the target wallet
- you still have enough SOL left for fees
- the wallet is the correct managed or external wallet for the next workflow

## Common Issues

### I funded the wrong wallet

Stop and confirm addresses before sending more funds or starting routines.

### I bought a token but still cannot pay Solana fees

You still need native SOL for fees even if you hold SPL tokens.

### I want to test flows without using real capital

Use devnet and the runtime's devnet airdrop capability instead of mainnet funds.
