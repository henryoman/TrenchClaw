---
title: AI, RPC, and Vault Setup
description: Set the local vault, choose an RPC, and add the AI credentials used by the current GUI and runtime.
order: 3
---

## Vault

- the vault is a local JSON file in the protected runtime state
- the GUI can create it from the bundled template
- saving secrets writes back to that file

## Supported Secret Types

### Blockchain

- default Solana RPC URL
- Helius HTTP URL
- Helius WS URL
- Helius API key
- QuickNode HTTP URL
- QuickNode WS URL
- QuickNode API key
- Solana Vibe Station API key
- Chainstack API key
- Temporal API key
- Jupiter Ultra API key
- Ultra signer private key
- Ultra signer private key encoding

### AI

- OpenRouter API key
- Vercel AI Gateway API key
- OpenAI API key
- Anthropic API key
- Google AI API key
- OpenAI-compatible API key

## RPC Setup

- public RPC presets
- custom RPC URLs

Built-in public presets:

- Solana Mainnet public RPC
- Solana Devnet public RPC

## Setup Steps

1. Launch TrenchClaw and sign into an instance.
2. Open the secrets or vault panel.
3. Set your RPC first.
4. Add credentials for one AI provider.
5. Save.
6. Run the AI check.
7. Send a simple chat request.

## AI Check

The AI check depends on:

- a valid provider key
- a valid model or route
- runtime secret resolution working correctly

## Validation Checklist

- vault file exists and is parseable JSON
- default RPC path is set to the endpoint you actually want
- AI provider key is saved without extra whitespace
- the model string matches the provider's expected identifier
- the GUI AI test succeeds
- a simple chat request succeeds after setup

## Troubleshooting

### AI request fails

- the selected provider key
- the model identifier
- whether the provider account has access to that model

### RPC behavior is inconsistent

- the URL is correct
- the endpoint is reachable
- the provider supports the cluster you intend to use

### Vault file appeared automatically

That can happen on first load in the current GUI flow. Review the saved contents before continuing.
