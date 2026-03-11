---
title: AI, RPC, and Vault Setup
description: Configure the local vault, pick an RPC path, and wire up the AI provider credentials that the shipped GUI actually exposes today.
order: 3
---

TrenchClaw stores operator secrets in a local vault file, then resolves those values into runtime settings at boot.

## What The Vault Is

The GUI works against a JSON vault file stored in the protected runtime state.

Current behavior:

- the vault lives under the runtime state's `protected/no-read` area
- the GUI can initialize the vault from the bundled template if it does not exist yet
- saving secrets writes back to that local JSON file

## What The GUI Exposes Today

The current shipped secret surface is broader than the older docs suggested.

### Blockchain And Execution Secrets

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

### AI Provider Secrets

- OpenRouter API key
- Vercel AI Gateway API key
- OpenAI API key
- Anthropic API key
- Google AI API key
- OpenAI-compatible API key

## RPC Setup

The GUI supports two kinds of default Solana RPC selection:

- public RPC presets
- custom RPC URLs

The built-in public presets currently exposed in the GUI are:

- Solana Mainnet public RPC
- Solana Devnet public RPC

### Important Current Behavior

In the current GUI/runtime flow, simply loading the secrets panel can initialize the vault and may populate the default RPC entry with the public mainnet endpoint if the field is blank. Treat that as the current shipped behavior, not as an explicit operator confirmation step.

## AI Setup Workflow

1. Launch TrenchClaw and sign into the instance you want to use.
2. Open the secrets or vault surface in the GUI.
3. Configure one working RPC path first.
4. Enter credentials for one AI provider you actually plan to use.
5. Save the secret values.
6. Run the GUI's AI connectivity check.
7. Send a simple low-risk chat prompt after the check succeeds.

## Recommended First AI Path

If you want the narrowest first-time setup:

1. Use one RPC endpoint that you trust.
2. Configure one provider only.
3. Start with one model that is already enabled on that provider account.

OpenRouter is still a straightforward first path if you already know the exact model string you want to use.

## What The AI Check Verifies

The GUI includes an AI check endpoint, but success still depends on:

- a valid provider key
- a valid model or route
- the runtime being able to resolve the corresponding secret values

Passing the AI check is a setup validation step, not proof that every tool or action path is ready for production trading.

## Runtime Settings Context

The runtime loads settings in layers:

1. bundled safety profile
2. resolved user settings
3. explicit user settings override file
4. sanitized agent override
5. protected-path enforcement
6. schema validation

The vault participates in that process through resolved secret references rather than direct inline plaintext everywhere.

## Validation Checklist

- vault file exists and is parseable JSON
- default RPC path is set to the endpoint you actually want
- AI provider key is saved without extra whitespace
- the model string matches the provider's expected identifier
- the GUI AI test succeeds
- a simple chat request succeeds after setup

## Common Issues

### AI requests fail even though the GUI loads

The GUI can start even when AI credentials are missing or invalid. Recheck:

- the selected provider key
- the model identifier
- whether the provider account has access to that model

### RPC looks configured but runtime behavior is inconsistent

That is often an RPC-quality problem rather than a wallet problem. Verify:

- the URL is correct
- the endpoint is reachable
- the provider supports the cluster you intend to use

### The vault file was created before you meant to save anything

That is consistent with the current first-load GUI behavior. Review the vault contents explicitly before continuing with live actions.
