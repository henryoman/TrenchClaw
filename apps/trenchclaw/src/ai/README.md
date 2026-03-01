# AI Folder Map

`src/ai` has three clear layers:

- `runtime/types/`: pure runtime interfaces and shared domain types (no implementation logic).
- `core/`: deterministic runtime implementations that satisfy `runtime/types`.
- `llm/`: model I/O only (prompt loading + Vercel AI SDK calls).

## What Lives Where

- `core/dispatcher.ts`: executes `ActionStep[]` with retries, policy checks, and idempotency.
- `core/scheduler.ts`: runs due jobs and dispatches routine plans.
- `core/state-store.ts`: in-memory state implementation (jobs, receipts, logs).
- `llm/client.ts`: single OpenAI/Vercel AI SDK client wrapper.
- `llm/prompt-loader.ts`: builds system payloads from `src/ai/brain/protected/system-settings/system/prompts/payload-manifest.yaml`.
- `llm/prompt-manifest.ts`: prompt manifest parsing and mode resolution.
- `llm/shared.ts`: shared path/structure parsing helpers for loaders.

## Rule of Thumb

- If code calls RPC, wallet, or mutates state via actions: it belongs in runtime orchestration (`core/`).
- If code calls `generateText` / `streamText`: it belongs in `llm/`.
- The planner should depend on `llm/`, then output deterministic `ActionStep[]` for `core/dispatcher`.
- `core/` should import types from `runtime/types` only, and never from `llm/`.

## Minimal Usage

```ts
import { bootstrapRuntime } from "../runtime/bootstrap";

const runtime = await bootstrapRuntime();
if (!runtime.llm) {
  throw new Error("AI provider credentials are missing");
}

const response = await runtime.llm.generate({
  prompt: "Summarize risk for swapping SOL -> USDC right now",
});

console.log(response.text);
```

## LLM Provider Standard

TrenchClaw uses a provider-agnostic OpenAI-compatible standard via AI SDK.

Primary secret source is vault:

- `src/ai/brain/protected/no-read/vault.json`
- `llm.openrouter.api-key`
- `llm.openai.api-key`
- `llm.openai-compatible.api-key`
- `llm.gateway.api-key`

Provider selection/model config can be controlled by env:

- `TRENCHCLAW_AI_PROVIDER`: `openrouter` (default), `openai`, or `openai-compatible`.
- `TRENCHCLAW_AI_MODEL`: model id for the provider.
- `TRENCHCLAW_AI_BASE_URL`: optional override base URL.

Legacy env API keys are still accepted:

- `OPENROUTER_API_KEY`: `openrouter`.
- `OPENAI_API_KEY`: `openai`.
- `TRENCHCLAW_AI_API_KEY`: `openai-compatible`.
- `AI_GATEWAY_API_KEY`: gateway mode.

Default provider/model is OpenRouter + Step 3.5 Flash free: `stepfun/step-3.5-flash:free`.
