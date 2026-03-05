---
title: AI and Vault Setup
description: Complete, in-depth guide to configuring your AI provider and vault secrets using OpenRouter or Vercel AI Gateway.
order: 2
---

This guide walks through the AI setup side of TrenchClaw in detail.

The goal is simple: make sure TrenchClaw can reliably call a model by configuring your key in the vault and validating it before you do real actions.

This page starts with two provider paths:

- OpenRouter
- Vercel AI Gateway

## What the Vault Is (User Version)

TrenchClaw stores sensitive values (API keys, RPC-related secrets, and integration keys) in a local vault.

For this guide, you only need to care about these AI entries:

- `llm/openrouter/api-key`
- `llm/openrouter/model`
- `llm/openrouter/base-url`
- `llm/gateway/api-key`
- `llm/gateway/model`

If your key is missing or invalid, the UI may still open, but AI responses and AI-driven actions will fail.

## Before You Configure AI

Confirm these are already done:

- You can launch TrenchClaw
- Your Solana wallet is configured
- Your RPC URL is configured

If those are not done yet, finish `Getting Started` first.

## Provider Path A: OpenRouter (Recommended Starting Point)

Use this path when you want a straightforward setup and fast first response.

### Step A1: Get an OpenRouter API Key

OpenRouter site:

- <https://openrouter.ai>

Create or copy your API key from your account dashboard.

Treat this key like a password.

### Step A2: Choose a Model

Pick a model available on your OpenRouter account.

TrenchClaw can run with any model your key can access, but for first-run stability:

- start with a low-latency model
- avoid experimental model IDs for your first test

### Step A3: Enter OpenRouter Values in TrenchClaw

Set:

- `OpenRouter API Key`: your OpenRouter key
- `Model`: your selected model ID

Base URL defaults to OpenRouter endpoint in most cases. If asked explicitly, use:

```text
https://openrouter.ai/api/v1
```

### Step A4: Save and Validate

After saving, run your first read-only AI interaction.

Expected success behavior:

- no provider auth error
- model returns a response
- runtime does not show key/config failures

Expected failure behavior if misconfigured:

- unauthorized / invalid API key
- model not found / not available
- rate limit or billing restriction error

## Provider Path B: Vercel AI Gateway

Use this path when you want to route model requests through AI Gateway.

### Step B1: Get a Vercel AI Gateway Key

Vercel docs/product entry:

- <https://vercel.com/docs/ai-gateway>

Create or copy your AI Gateway API key.

### Step B2: Choose a Gateway Model String

Set a valid model route for AI Gateway.

Your model string must match what your gateway/account can resolve.

If a model string is invalid, requests fail even if the API key is correct.

### Step B3: Enter Gateway Values in TrenchClaw

Set:

- `Vercel AI Gateway API Key`: your gateway key
- `Gateway Model`: model route string

### Step B4: Save and Validate

Run a basic AI prompt in TrenchClaw.

Expected success behavior:

- request returns model output
- no gateway auth errors

Expected failure behavior:

- unauthorized / forbidden (key issue)
- model route invalid
- provider-side quota/rate errors

## Exactly What to Configure First (Minimal Working Setup)

If you want the shortest path to a working AI connection, do only this:

1. Configure one provider path only (OpenRouter or Gateway).
2. Enter one valid API key.
3. Enter one valid model.
4. Save settings.
5. Run one read-only AI request.

Do not configure both paths at the same time for your very first test unless you need failover behavior right away.

## Recommended First-Run Sequence

1. Launch TrenchClaw.
2. Open settings/secrets screen.
3. Configure OpenRouter path first.
4. Run one test prompt.
5. If successful, optionally add Vercel AI Gateway as your secondary path.
6. Only then start higher-risk wallet actions.

## Validation Checklist (Copy/Paste)

Use this checklist after entering your key:

- Key saved without formatting changes
- Model string saved exactly as provider expects
- First AI prompt returns successfully
- No auth errors in UI/runtime output
- No model-not-found errors

If all five pass, your AI layer is ready.

## Common Mistakes and How to Fix Them

### Mistake 1: Extra spaces in key value

Symptoms:

- key looks correct
- auth fails anyway

Fix:

- re-paste key carefully
- remove trailing spaces/new lines
- save again and retry

### Mistake 2: Wrong model ID

Symptoms:

- provider auth passes
- response fails with model error

Fix:

- copy exact model ID from provider dashboard/docs
- update model field and retry

### Mistake 3: Using multiple providers before first success

Symptoms:

- unclear which provider is failing
- mixed error messages

Fix:

- disable extra provider path temporarily
- get one provider fully green first

### Mistake 4: Billing/quota limits

Symptoms:

- intermittent errors or hard failures despite valid key

Fix:

- check provider usage/billing page
- lower request volume
- switch to a model available under your current plan

## Security Practices for AI Keys

- Never post API keys in chat, screenshots, or logs.
- Rotate keys immediately if you suspect exposure.
- Use separate keys for development and production where possible.
- Keep only currently used keys active.

## Fast Recovery Flow If AI Breaks Later

1. Re-test with a simple prompt.
2. Check which provider path is currently active.
3. Re-enter key and model for that path.
4. Confirm account quota/billing.
5. Retry with a known-good model.

This isolates most failures in a few minutes.

## OpenRouter Quick Reference

- Site: <https://openrouter.ai>
- Required field: OpenRouter API key
- Typical base URL: `https://openrouter.ai/api/v1`
- Required: valid model ID available to your account

## Vercel AI Gateway Quick Reference

- Docs: <https://vercel.com/docs/ai-gateway>
- Required field: AI Gateway API key
- Required: gateway model route that resolves for your account

## Done State

You are fully done with AI setup when:

- One provider path is configured end-to-end
- A test AI prompt returns successfully
- No auth/model errors appear

At that point, move on to your normal TrenchClaw runtime workflow.
