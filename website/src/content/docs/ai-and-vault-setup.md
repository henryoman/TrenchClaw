---
title: AI and Vault Setup
description: Set up one AI provider in TrenchClaw and verify that requests work.
order: 2
---

Set up your AI provider and confirm it works before running live actions.

- OpenRouter
- Vercel AI Gateway

## Before You Configure AI

Confirm:

- TrenchClaw launches
- Wallet is configured
- RPC is configured

If not, complete `Getting Started` first.

## Vault Keys Used for AI

TrenchClaw stores AI config in local vault entries:

- `llm/openrouter/api-key`
- `llm/openrouter/model`
- `llm/openrouter/base-url`
- `llm/gateway/api-key`
- `llm/gateway/model`

If the key or model is invalid, the app may open but AI requests will fail.

## Path A: OpenRouter (Recommended First)

1. Create or copy your key from [openrouter.ai](https://openrouter.ai).
2. Pick a stable model available on your account.
3. Enter:
   - `OpenRouter API Key`
   - `Model`
4. If base URL is requested, use:

   ```text
   https://openrouter.ai/api/v1
   ```

5. Save and run one read-only test prompt.

## Path B: Vercel AI Gateway

1. Create or copy your key from [Vercel AI Gateway docs](https://vercel.com/docs/ai-gateway).
2. Choose a valid gateway model route.
3. Enter:
   - `Vercel AI Gateway API Key`
   - `Gateway Model`
4. Save and run one read-only test prompt.

## Minimal Working Setup

1. Configure one provider path only (OpenRouter or Gateway).
2. Enter one valid API key.
3. Enter one valid model.
4. Save.
5. Run one read-only AI request.

## Validation Checklist

- Key saved without formatting changes
- Model string saved exactly as provider expects
- First test prompt returns successfully
- No auth errors
- No model-not-found errors

## Common Issues

### Auth fails even with a valid key

- Re-paste key
- Remove trailing spaces/new lines
- Save and retry

### Model route or ID is invalid

- Copy exact model ID/route from provider docs
- Save and retry

### Quota or billing errors

- Check provider usage/billing
- Retry with a lower-cost model available on your plan

## Setup Complete

AI setup is complete when one provider returns successful test prompts with no authentication or model errors.
