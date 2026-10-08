---
title: Keys and Settings
description: Which keys matter, which settings matter, and how to keep the default TrenchClaw setup clean.
order: 2
featured: true
---

For most users, there are only three rules:

1. Save your AI key first.
2. Leave private RPC blank unless you already know you want it.
3. If you want swaps, stay on `Ultra`.

That is the clean setup story.

## Recommended Defaults

- AI key: `OpenRouter API Key`
- AI provider: `OpenRouter`
- AI model: use the default your build recommends
- RPC: leave it alone unless you have private RPC credentials
- Swaps: add a `Jupiter API Key` only when you want swap flows

## Keys

| Key | Use it when | Default guidance |
| --- | --- | --- |
| `OpenRouter API Key` | You want the default AI path working quickly | Start here |
| `Private RPC credential` | You want Helius, QuickNode, Chainstack, or another private RPC | Optional |
| `Jupiter API Key` | You want Jupiter swap flows | Optional |
| `Vercel AI Gateway API Key` | You want the Vercel AI Gateway path instead of OpenRouter | Advanced or alternative |

If you do not know whether you need a key beyond `OpenRouter API Key`, you probably do not need it on day one.

## Settings

### AI

For the clean default setup:

- provider: `OpenRouter`
- model: use the model your build recommends

If you switch providers, make sure the key in **Keys** matches the provider in **Settings**.

### RPC

Only touch RPC settings if you already saved a `Private RPC credential`.

If you did not do that, leave RPC alone and use the default runtime path.

### Trading

If you are not trading yet, you can ignore most trading configuration.

If you are trading, keep the default swap path on `Ultra` unless you have a specific reason to change it.

## What `Ultra` Means

`Ultra` is the saved setting name for Jupiter's managed swap path in TrenchClaw. It now uses Swap V2 `/order` and `/execute`: the runtime signs with your selected wallet and Jupiter handles transaction landing.

The short version:

- TrenchClaw requests a swap through Jupiter Swap V2
- Jupiter handles routing
- Jupiter handles execution details for that flow

If you see other swap options in a build, treat them as advanced configuration rather than the default docs path.

Useful Jupiter references:

- [Jupiter API setup](https://developers.jup.ag/docs/api-setup)
- [Jupiter managed swaps](https://developers.jup.ag/docs/swap/order-and-execute)

## Swap Fees

TrenchClaw adds no referral fee by default. Jupiter's own platform fees may still apply.

Managed swaps accept optional `referralAccount` and `referralFee` parameters. The fee is in basis points: 50 bps is 0.5%. Set up a Jupiter referral account and token accounts for the fee mints before enabling fees. Jupiter selects the fee mint and takes 20% of the integrator fee when referral collection is active.

Check the returned `feeBps` and `feeMint` when reviewing a quote. The advanced `standard` path uses `/build` and runtime submission; it does not accept these managed referral parameters.

## Safe First-Run Setup

1. Save `OpenRouter API Key`.
2. In **Settings**, choose `OpenRouter`.
3. Pick the recommended model from your build.
4. Leave private RPC blank unless you already use a private RPC.
5. If you want swaps, save `Jupiter API Key`.
6. Keep the swap path on `Ultra`.

## What To Ignore Until You Need It

- `Private RPC credential`
- RPC provider settings
- `Jupiter API Key` when you are not swapping
- `Vercel AI Gateway API Key` if you are already using OpenRouter

Ignoring the optional surfaces is the fastest way to keep setup clean.

## Troubleshooting

- If chat does not work, confirm the key in **Keys** matches the provider in **Settings**.
- If runtime reads or trading flows look wrong, run `trenchclaw doctor`.
- If you changed files outside the GUI, reload the relevant panel before retrying.
