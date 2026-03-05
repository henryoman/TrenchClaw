---
title: AI and Vault Setup
description: Configure one AI provider path in TrenchClaw and validate it quickly.
order: 2
---

Use this page to get a clean, working AI setup before any higher-risk actions.

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

If key/model values are invalid, UI can still open but AI responses will fail.

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

## Done

AI setup is complete when one provider path returns successful test prompts with no auth/model errors.
