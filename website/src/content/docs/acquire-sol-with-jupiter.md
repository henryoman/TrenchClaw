---
title: Acquire SOL with Jupiter
description: Up-to-date user guide for funding your wallet through Jupiter onramp flows.
order: 3
---

Use this guide when you need to fund your wallet with SOL before using TrenchClaw features.

## What Jupiter Handles

Jupiter routes swaps on Solana and also exposes onramp paths so users can move from fiat to crypto.

For onramp, Jupiter currently points users through supported providers (for example Onramper flows on web; provider availability can change by region and payment method).

## Before You Start

Make sure you have:

- a wallet address ready inside TrenchClaw
- your country/region supported by the selected onramp provider
- an accepted payment method (card/bank/etc., depends on provider)
- identity verification documents if required by your provider (KYC)

## Path A: Jupiter Web Onramp Flow

1. Open `https://jup.ag`.
2. Navigate to the buy/onramp flow in Jupiter UI.
3. Choose your input currency (USD/EUR/etc., depending on provider support).
4. Choose asset to receive: `SOL`.
5. Enter your wallet address from TrenchClaw.
6. Select the onramp quote/provider shown by Jupiter.
7. Complete provider checkout and required verification.
8. Wait for transfer finalization and confirm balance in wallet.

## Path B: Swap from Stablecoins to SOL (If You Already Hold USDC/USDT)

If you already have stablecoins in your wallet:

1. Open `https://jup.ag/swap`.
2. Set `From` token to `USDC` or `USDT`.
3. Set `To` token to `SOL`.
4. Review route, fees, and minimum received.
5. Confirm swap.
6. Wait for confirmation and check updated SOL balance.

## What to Verify After Purchase

- transaction completed on-chain
- SOL appears in your target wallet
- enough extra SOL remains for network fees

## Common Issues

### Provider unavailable in your region

- try a different provider surfaced by Jupiter
- try a different payment method

### KYC/verification blocked

- complete required identity checks with the provider
- retry only after provider confirms verification status

### Purchased asset not visible yet

- wait for settlement/finality
- refresh wallet balances
- verify you used the correct wallet address

### You bought USDC, not SOL

- use Jupiter swap flow (`jup.ag/swap`) to convert to SOL

## Safety Notes

- always verify the URL is `https://jup.ag`
- never share your seed phrase/private key
- send a small test amount first if you are unsure

## References

- Jupiter: `https://jup.ag`
- Jupiter Support (onramp overview): `https://support.jup.ag/hc/en-us/articles/34925170457364-How-do-I-onramp-funds-into-jup-ag-using-fiat`
- Jupiter Support Center: `https://support.jup.ag`
