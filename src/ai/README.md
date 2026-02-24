# AI Folder Map

`src/ai` has two responsibilities:

- `contracts/` + `core/`: deterministic runtime orchestration (actions, policies, scheduler, state, events).
- `llm/`: model I/O only (prompt loading + Vercel AI SDK calls).

## What Lives Where

- `core/dispatcher.ts`: executes `ActionStep[]` with retries, policy checks, and idempotency.
- `core/scheduler.ts`: runs due jobs and dispatches routine plans.
- `core/state-store.ts`: in-memory state implementation (jobs, receipts, logs).
- `llm/client.ts`: single OpenAI/Vercel AI SDK client wrapper.
- `llm/prompt-loader.ts`: loads `src/brain/protected/prompts/system.md`.

## Rule of Thumb

- If code calls RPC, wallet, or mutates state via actions: it belongs in runtime orchestration (`core/`).
- If code calls `generateText` / `streamText`: it belongs in `llm/`.
- The planner should depend on `llm/`, then output deterministic `ActionStep[]` for `core/dispatcher`.

## Minimal Usage

```ts
import { bootstrapRuntime } from "../runtime/bootstrap";

const runtime = await bootstrapRuntime();
if (!runtime.llm) {
  throw new Error("OPENAI_API_KEY is missing");
}

const response = await runtime.llm.generate({
  prompt: "Summarize risk for swapping SOL -> USDC right now",
});

console.log(response.text);
```
