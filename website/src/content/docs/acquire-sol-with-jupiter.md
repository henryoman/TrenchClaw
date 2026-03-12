---
title: Funding Wallets
description: Fund wallets for real use or devnet testing.
order: 5
---

## Real Funds

For real funds, TrenchClaw does not provide a built-in fiat onramp. Fund the wallet externally, then use TrenchClaw after the assets are already there.

## Devnet

For devnet testing, the runtime exposes `devnetAirdrop`.

Use it for:

- testing managed wallet flows
- testing routines without real funds
- validating action wiring

## Before Funding

Confirm:

- you are in the correct instance
- you know whether you are operating on devnet or mainnet-style infrastructure
- the wallet you are funding is the wallet you actually intend to use
- you are keeping extra SOL available for fees

## External Jupiter Path

If you use Jupiter outside TrenchClaw:

1. Verify the URL is `https://jup.ag`.
2. Use the wallet address you intend to use with TrenchClaw.
3. Wait for settlement and final confirmation.
4. Recheck balances before running runtime actions.

## Verify

- the asset is visible in the target wallet
- you still have enough SOL left for fees
- the wallet is the correct managed or external wallet for the next workflow

## Common Issues

### Wrong wallet funded

Stop and confirm addresses before sending more funds or starting routines.

### No SOL for fees

You still need native SOL for fees even if you hold SPL tokens.

### Testing only

Use devnet and the runtime's devnet airdrop capability instead of mainnet funds.
