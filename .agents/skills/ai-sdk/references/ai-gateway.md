---
title: Vercel AI Gateway
description: Reference for using Vercel AI Gateway with the AI SDK.
---

# Vercel AI Gateway

The Vercel AI Gateway is the fastest way to get started with the AI SDK. It provides access to models from OpenAI, Google, xAI, and other providers through a single API.

## Authentication

Authenticate with OIDC (for Vercel deployments) or an [AI Gateway API key](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys&title=AI+Gateway+API+Keys):

```env filename=".env.local"
AI_GATEWAY_API_KEY=your_api_key_here
```

## Usage

The AI Gateway is the default global provider, so you can access models using a simple string:

```ts
import { generateText } from 'ai';

const { text } = await generateText({
  model: 'provider/model-id',
  prompt: 'What is love?',
});
```

You can also explicitly import and use the gateway provider:

```ts
// Option 1: Import from 'ai' package (included by default)
import { gateway } from 'ai';
model: gateway('provider/model-id');

// Option 2: Install and import from '@ai-sdk/gateway' package
import { gateway } from '@ai-sdk/gateway';
model: gateway('provider/model-id');
```

## Find Available Models

**Important**: Always fetch the current model list before writing code. Never use model IDs from memory - they may be outdated.

List all available models through the gateway API:

```bash
curl https://ai-gateway.vercel.sh/v1/models
```

Filter by provider using `jq`. **Do not truncate with `head`** - always fetch the full list to find the latest models:

```bash
# OpenAI models
curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '[.data[] | select(.id | startswith("openai/")) | .id] | reverse | .[]'

# Google models
curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '[.data[] | select(.id | startswith("google/")) | .id] | reverse | .[]'

# xAI models
curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '[.data[] | select(.id | startswith("xai/")) | .id] | reverse | .[]'
```

When multiple versions of a model exist, use the newest compatible version returned by the gateway instead of relying on older hard-coded examples.
