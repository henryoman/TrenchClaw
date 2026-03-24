---
title: Keys and Settings
description: The clean explanation of which keys matter, which settings matter, and what Ultra actually means in TrenchClaw.
order: 2
featured: true
---

## The Only Things Most Users Need To Know

There are two setup panels:

- `Keys`
- `Settings`

For a normal first run, you only need to understand three things:

1. Save your AI key first.
2. Leave private RPC blank unless you really want a private RPC.
3. If you want swaps, use `Ultra`.

That is the whole setup story for most users.

## Keys

### `OpenRouter API Key`

This is the recommended first key.

Use it when you want chat working with the default setup.

### `Private RPC credential`

This is optional.

Use it only when you want:

- Helius
- QuickNode
- Chainstack
- another private RPC instead of the public Solana RPC

If you do not know whether you need this, you probably do not need it yet.

### `Jupiter Ultra API Key`

This is optional.

Use it only when you want swaps through Jupiter Ultra.

If you are not swapping yet, leave it blank.

### `Vercel AI Gateway API Key`

This is an alternative AI path.

Most users should ignore it and use `OpenRouter` first.

## Settings

### AI

For the recommended setup, use:

- provider: `OpenRouter`
- model: `Step 3.5 Flash Free`

### RPC

Only touch this if you already saved a `Private RPC credential` in `Keys`.

If you did not do that, leave the RPC setup alone.

### Default swap setting

This is the swap setting that matters right now.

- `Ultra` is the supported path
- the non-Ultra path is still coming soon

## Ultra vs The Coming-Soon Manual Path

### `Ultra`

`Ultra` means Jupiter manages the swap flow for you.

The simple version:

- TrenchClaw sends the swap through Jupiter Ultra
- Jupiter chooses the route
- Jupiter handles the slippage behavior
- Jupiter handles the landing and execution path

In TrenchClaw today, `Ultra` is the supported swap path.

Jupiter's current Ultra docs describe Ultra as the managed swap product and note that Jupiter handles transaction
broadcasting, routing, and execution details through the Ultra flow. Useful references:

- [Jupiter API setup](https://dev.jup.ag/docs/api-setup)
- [Jupiter Ultra V3 update](https://dev.jup.ag/updates/ultra-v3)

### The coming-soon manual path

This is not the path you should think about right now.

The only difference you need to understand is:

- `Ultra` is the current managed Jupiter path
- the other path is the future self-managed path

Today, that other path is just a placeholder.

## Recommended Default Setup

1. Save `OpenRouter API Key`.
2. In `Settings`, choose `OpenRouter`.
3. In `Settings`, choose `Step 3.5 Flash Free`.
4. Leave private RPC blank unless you want a private RPC.
5. If you want swaps, save `Jupiter Ultra API Key`.
6. Keep the default swap setting on `Ultra`.

## What To Ignore For Now

You do not need to touch something just because it exists.

Ignore it unless you actually need it:

- `Vercel AI Gateway API Key`
- private RPC setup
- `Jupiter Ultra API Key` when you are not swapping
- the non-Ultra swap path

That keeps the setup clean.
