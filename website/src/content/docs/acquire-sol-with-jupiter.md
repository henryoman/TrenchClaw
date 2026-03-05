---
title: Acquire SOL with Jupiter
description: Fast path to fund your wallet with SOL using Jupiter onramp or swap flows.
order: 3
---

Use this when your wallet needs SOL before running TrenchClaw actions.

## Before You Start

Confirm:

- a wallet address ready inside TrenchClaw
- your country/region supported by the selected onramp provider
- an accepted payment method (card/bank/etc., depends on provider)
- identity verification documents if required by your provider (KYC)

## Path A: Buy SOL with Onramp

1. Open `https://jup.ag`.
2. Open the Buy/Onramp flow.
3. Choose your input currency.
4. Set asset to receive: `SOL`.
5. Enter your wallet address from TrenchClaw.
6. Select provider/quote shown by Jupiter.
7. Complete provider checkout and required verification.
8. Wait for finalization, then confirm SOL balance.

## Path B: Swap USDC/USDT to SOL

1. Open `https://jup.ag/swap`.
2. Set `From` token to `USDC` or `USDT`.
3. Set `To` token to `SOL`.
4. Review route, fees, and minimum received.
5. Confirm swap.
6. Wait for confirmation and verify SOL balance.

## Verify

- transaction completed on-chain
- SOL appears in your target wallet
- enough extra SOL remains for network fees

## Common Issues

### Provider unavailable in your region

- try another provider shown by Jupiter
- try another payment method

### KYC/verification blocked

- complete required identity checks with the provider
- retry only after provider confirms verification status

### Purchased asset not visible yet

- wait for settlement/finality
- refresh wallet balances
- verify you used the correct wallet address

### You bought USDC, not SOL

- use `https://jup.ag/swap` to convert to SOL

## Notes

- always verify the URL is `https://jup.ag`
- never share seed phrase/private key
- use a small test amount first if unsure

## References

- Jupiter: `https://jup.ag`
- Jupiter Support (onramp overview): `https://support.jup.ag/hc/en-us/articles/34925170457364-How-do-I-onramp-funds-into-jup-ag-using-fiat`
- Jupiter Support Center: `https://support.jup.ag`
