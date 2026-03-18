---
title: AI, RPC, and Vault Setup
description: Set the local vault, choose an RPC, and add the AI credentials used by the current GUI and runtime.
order: 3
featured: true
---

## Vault

- the vault is a local JSON file in the protected runtime state
- the GUI can create it from the bundled template
- saving secrets writes back to that file

## Supported Secret Types

### Blockchain

- default Solana RPC credential
- Jupiter Ultra API key

### AI

- OpenRouter API key
- Vercel AI Gateway API key

## RPC Setup

- public RPC presets
- custom RPC URLs
- private RPC provider credentials

Built-in public presets:

- Solana Mainnet public RPC
- Solana Devnet public RPC

## Helius Setup

If you want richer Helius-backed wallet reads and early swap-history support:

1. Open the secrets or vault panel.
2. Set `Private RPC credential`.
3. Choose `Helius` as the provider.
4. Paste your Helius API key.
5. Save.

That setup writes the active RPC under `rpc/default/*` and keeps legacy `rpc/helius/*` compatibility fields for older Helius-specific reads.

Current Helius-backed runtime behavior:

- `getManagedWalletContents` prefers Helius DAS when Helius is the selected private RPC
- `getManagedWalletContents` falls back to raw Solana RPC token-account reads when Helius is not selected
- `getSwapHistory` uses Helius enhanced transaction history and needs a Helius API key
- the GUI-generated Helius RPC URLs include both HTTP and WebSocket endpoints automatically

## Setup Steps

1. Launch TrenchClaw and sign into an instance.
2. Open the secrets or vault panel.
3. Set your RPC first.
4. Add a Vercel AI Gateway key, an OpenRouter key, or both.
5. Open AI settings and choose `Vercel AI Gateway` or `OpenRouter`.
6. Pick the model from the filtered list for that provider.
7. Save.
8. Run the AI check.
9. Send a simple chat request.

## AI Check

The AI check depends on:

- a valid provider key
- a valid model or route
- runtime secret resolution working correctly
- the provider selection in `ai.json`

## Validation Checklist

- vault file exists and is parseable JSON
- default RPC path is set to the endpoint you actually want
- if you selected Helius, `rpc/default/provider-id` resolves to `helius`
- if you selected Helius, the vault also contains a non-empty Helius API key
- AI provider key is saved without extra whitespace
- the selected provider in AI settings is the one you intend to use
- the model string matches the provider's expected identifier
- the GUI AI test succeeds
- a simple chat request succeeds after setup
- `trenchclaw doctor` reports the relevant keys and workflows as ready

## Troubleshooting

### AI request fails

- the selected provider key
- whether `provider` is `gateway` or `openrouter`
- the model identifier
- whether the provider account has access to that model

### RPC behavior is inconsistent

- the URL is correct
- the endpoint is reachable
- the provider supports the cluster you intend to use
- for rich managed-wallet contents, confirm Helius is the selected private RPC instead of a public RPC URL

### Vault file appeared automatically

That can happen on first load in the current GUI flow. Review the saved contents before continuing.
