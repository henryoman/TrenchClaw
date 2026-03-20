---
title: Getting Started
description: Install TrenchClaw, launch it, add the right first key, and stop once the basic setup is working.
order: 1
featured: true
---

## The Shortest Setup

If you want the fast version, do this in order:

1. Install the release.
2. Run `trenchclaw`.
3. Create or sign into an instance.
4. Open `Keys` and save your `OpenRouter API Key`.
5. Open `Settings` and set:
   - AI provider: `OpenRouter`
   - model: `GPT-5.4 Nano`
6. Click `Test AI connection`.
7. Stop there unless you specifically need a private RPC or Ultra swaps.

That is the clean default setup.

## Install

### macOS

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/macos-bootstrap.sh | bash
```

### Linux

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | bash
```

If you need to pin a release:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/macos-bootstrap.sh | TRENCHCLAW_VERSION=v0.0.0-beta.4 bash
```

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | TRENCHCLAW_VERSION=v0.0.0-beta.4 bash
```

## Launch And Check Readiness

Start the app with:

```bash
trenchclaw
```

Then run:

```bash
trenchclaw doctor
```

Use `doctor` whenever:

- the app looks half-configured
- AI will not connect
- you changed keys
- you changed RPC setup

## What To Do Inside The App

### 1. Create or sign into an instance

Do this first. The instance is where TrenchClaw stores your vault and trading settings.

### 2. Open `Keys`

For most users, only one key matters on day one:

- `OpenRouter API Key`: required for the recommended chat setup

These are optional:

- `Private RPC credential`: only if you want Helius or another private RPC
- `Jupiter Ultra API Key`: only if you want Ultra swaps
- `Vercel AI Gateway API Key`: only if you intentionally use Gateway instead of OpenRouter

### 3. Open `Settings`

Use these defaults:

- AI provider: `OpenRouter`
- model: `GPT-5.4 Nano`
- leave the default swap setting on `Ultra`

Leave the private RPC setting alone unless you already saved a `Private RPC credential` in `Keys`.

## When You Actually Need Extra Keys

### Private RPC credential

Add this only when you want:

- Helius-backed reads
- a private RPC provider instead of the public Solana RPC

If you are just getting started, you can leave this blank.

### Jupiter Ultra API Key

Add this only when you want swaps through Jupiter Ultra.

If you are not swapping yet, leave it blank.

## What `Ultra` Means

`Ultra` means TrenchClaw uses Jupiter's managed Ultra swap flow.

The simple version is:

- TrenchClaw sends the swap through Jupiter Ultra
- Jupiter handles the route
- Jupiter handles the slippage logic
- Jupiter handles the landing and execution flow

That is why `Ultra` is the recommended option right now.

The other non-Ultra path is still a coming-soon path. You do not need to think about it yet.

## If Something Fails

Check these in order:

1. Run `trenchclaw doctor`.
2. Confirm an instance is active.
3. Confirm the key you saved matches the setting you selected.
4. Click `Test AI connection` again after saving settings.

If you need the exact key and settings breakdown, use [Keys and Settings](/docs/keys-and-settings).
