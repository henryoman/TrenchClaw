---
title: Keys and Settings
description: Understand what lives in the vault, what lives in settings, and how to change the current beta configuration without guessing.
order: 2
featured: true
---

## The Mental Model

TrenchClaw splits configuration into three different buckets:

- keys and secrets for the active instance
- AI provider and model settings for the local runtime
- trading preferences for the active instance

That split matters because the app does not treat every setting as global.

## What Lives Where

### `vault.json`

The instance vault stores secrets and RPC credentials.

Current beta examples:

- `Private RPC credential`
- `Jupiter Ultra API Key`
- `OpenRouter API Key`
- `Vercel AI Gateway API Key`

This file is instance-scoped. Switching instances changes which vault the app reads.

### `ai.json`

The AI settings file stores the runtime-level AI selection:

- provider
- model
- default mode
- temperature
- max output tokens

This file is runtime-scoped, not instance-scoped.

### `trading.json`

The instance trading settings file stores per-instance trading preferences:

- default swap provider
- default swap mode
- default amount unit
- quick buy presets
- custom presets

This file is active-instance-scoped.

## Scope Rules

Use this rule of thumb:

- if it is sensitive, it belongs in the vault
- if it chooses how the AI runs, it belongs in `ai.json`
- if it changes swap or preset behavior for one instance, it belongs in `trading.json`

Current scope behavior:

- keys are instance-scoped
- AI settings are runtime-scoped
- trading settings are active-instance-scoped

## How To Change Things In The Current GUI

### Keys

Use the `Keys` panel.

The exact current secret labels are:

- `Private RPC credential`
- `Jupiter Ultra API Key`
- `OpenRouter API Key`
- `Vercel AI Gateway API Key`

When you save from that panel, the app updates the active instance vault for you.

### AI settings

Use the AI settings panel.

Today that panel controls:

- provider
- model
- default mode
- temperature
- max output tokens

The default runtime path is:

- provider: `openrouter`
- model: `openrouter/hunter-alpha`

### Trading settings

Use the trading settings panel.

Today it controls:

- default swap provider
- default swap mode
- default amount unit
- quick buy presets
- custom presets

## Recommended Baseline Setup

For most beta users, the clean default is:

1. Save `OpenRouter API Key`.
2. Set AI provider to `OpenRouter`.
3. Set model to `Hunter Alpha`.
4. Leave RPC on a public Solana endpoint until you need more.
5. Add Helius only when you want Helius-backed reads or swap history.
6. Add Jupiter Ultra only when you want swap or trigger-order workflows.

## OpenRouter Setup

OpenRouter is the recommended beta default because it matches the runtime default provider path.

Use:

- docs: [OpenRouter API Authentication](https://openrouter.ai/docs/api-keys)
- key page: [OpenRouter key settings](https://openrouter.ai/settings/keys)

Setup flow:

1. Create or sign into your OpenRouter account.
2. Create an API key.
3. In TrenchClaw, open `Keys`.
4. Save the key into `OpenRouter API Key`.
5. Open AI settings.
6. Set provider to `OpenRouter`.
7. Set model to `Hunter Alpha`.
8. Save.
9. Click `Test AI connection`.

Use `Vercel AI Gateway` only if you already have that route and want it on purpose. It is supported, but it is not the recommended first setup for this beta.

## Helius Setup

Helius is for the RPC side, not the default AI path.

Use it when you want:

- Helius-backed wallet enrichment
- richer managed wallet contents
- swap history through Helius enhanced transaction history

Useful links:

- docs: [Helius authentication guide](https://www.helius.dev/docs/api-reference/authentication)
- dashboard: [Helius Dashboard](https://dashboard.helius.dev/)

Fastest setup:

1. Create a Helius account or sign in.
2. Create an API key in the dashboard.
3. In TrenchClaw, open `Keys`.
4. Use `Private RPC credential`.
5. Select `Helius` as the provider.
6. Paste the Helius key.
7. Save.

That writes the active RPC configuration into the vault and generates the matching HTTP and WebSocket URLs for you.

Optional CLI path for power users:

```bash
bun add -g helius-cli@latest
```

```bash
helius keygen
helius signup --json
helius projects --json
helius rpc <project-id> --json
```

The CLI is optional. Do not install it unless you want the shell workflow.

## Jupiter Ultra Setup

Jupiter Ultra is only needed for Ultra swaps and trigger-order flows.

Useful links:

- docs: [Jupiter developer docs](https://dev.jup.ag/)
- API portal: [Jupiter developer portal](https://portal.jup.ag/pricing)

Setup flow:

1. Get an API key from the Jupiter portal.
2. In TrenchClaw, open `Keys`.
3. Save it into `Jupiter Ultra API Key`.
4. Rerun `trenchclaw doctor`.
5. Only then start testing swap or trigger-order workflows.

If you are not using Ultra yet, leave this blank.

## Public RPC Versus Private RPC

For basic first launch, a public Solana RPC is fine.

Use a private RPC when you need:

- more control over reliability
- Helius-backed enrichment
- better support for the workflows that depend on provider-specific reads

If you clear the private RPC credential, TrenchClaw falls back to a public Solana RPC selection instead of leaving the app without an RPC.

## File Ownership And Permissions

You should not need to hand-edit the filesystem for normal setup.

The app handles:

- creating the instance vault when needed
- creating `ai.json` when needed
- creating `trading.json` when needed
- writing best-effort secure file permissions for those files

That is why the recommended setup path is the GUI plus `trenchclaw doctor`, not manual file surgery.

## When To Use `trenchclaw doctor`

Run `trenchclaw doctor` when:

- chat is not available
- you saved a key and the app still looks unready
- you changed RPC setup
- you installed optional CLI tooling
- you are not sure which dependency is still missing

`doctor` should be your readiness check, not a last resort.
