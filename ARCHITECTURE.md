# TrenchClaw Architecture

TrenchClaw is a Solana action runtime with OpenClaw-style persistence patterns (session logs + memory logs), policy-gated execution, and a terminal-first control plane.

This document reflects the current codebase state in `src/**`.

---

## Current Direction

1. **Action runtime first**: deterministic actions and routines before broad agent autonomy.
2. **Policy over prompt**: runtime settings and policy engine are hard gates.
3. **Brain-owned persistence**: runtime data lives under `src/brain/db/**`.
4. **Auditability by default**: SQLite receipts + event files + session JSONL + memory markdown.
5. **Progressive AI integration**: LLM client exists but runtime remains action-centric.

---

## Runtime Entry Flow

### CLI entrypoint
- `src/apps/cli/index.ts`
- Commands:
  - `bun run dev`
  - `bun run start`
  - `bun run headless`
  - `bun run cli`

### Boot sequence
1. Parse CLI mode.
2. Resolve runtime profile (`safe`, `dangerous`, `veryDangerous`).
3. Call `bootstrapRuntime()` (`src/runtime/bootstrap.ts`).
4. Optionally start HTTP status server (`/health`, `/`).
5. Start scheduler loop.

---

## Core Runtime Composition

`src/runtime/bootstrap.ts` wires:

- `ActionRegistry`
- `PolicyEngine`
- `ActionDispatcher`
- `Scheduler`
- `StateStore` (SQLite or in-memory fallback)
- `RuntimeEventBus`
- Optional LLM client (`src/ai/llm/client.ts`)
- Solana adapters:
  - `jupiter-ultra`
  - `token-account`
  - `ultra-signer`

---

## Implemented Action Surface

Currently wired actions:

- `createWallets`
- `ultraQuoteSwap`
- `ultraExecuteSwap`
- `ultraSwap`

Source paths:
- `src/solana/actions/wallet-based/create-wallets/createWallets.ts`
- `src/solana/actions/wallet-based/swap/ultra/quoteSwap.ts`
- `src/solana/actions/wallet-based/swap/ultra/executeSwap.ts`
- `src/solana/actions/wallet-based/swap/ultra/swap.ts`

Transfer actions currently exist as stubs and are intentionally not part of active dangerous flow.

---

## Implemented Routines

- `createWallets` routine
- `actionSequence` routine (explicit ordered action graph with dependencies)

Source paths:
- `src/solana/routines/create-wallets.ts`
- `src/solana/routines/action-sequence.ts`

---

## Policy & Safety Model

### Settings profiles
- `safe`
- `dangerous`
- `veryDangerous`

Schema: `src/runtime/config/schema.ts`

### Settings layering
Loader: `src/runtime/config/loader.ts`

Merge order:
1. Bundled base profile (`src/brain/protected/settings/*.yaml`)
2. Sanitized agent override (`TRENCHCLAW_SETTINGS_AGENT_FILE`)
3. User override (`TRENCHCLAW_SETTINGS_USER_FILE`)
4. Protected-path enforcement (user/base authority restored)

Authority rules:
- `src/runtime/config/authority.ts`
- Dangerous/safe modes restrict agent-editable paths.
- Very dangerous mode allows broad agent override (except protected restoration rules).

### Extra dangerous-action confirmation gate
In `dangerous` mode, selected actions require explicit user confirmation token/flag (`trading.confirmations.*`).

---

## Persistence & Logging (Brain DB)

Canonical root: `src/brain/db/`

### SQLite runtime state
- `src/brain/db/runtime/trenchclaw.db`
- Backed by `bun:sqlite`
- Store: `src/runtime/storage/sqlite-state-store.ts`
- Tables:
  - `jobs`
  - `action_receipts`
  - `policy_hits`
  - `decision_logs`

### File event stream
- `src/brain/db/runtime/events/*.json`
- Writer: `src/runtime/storage/file-event-log.ts`

### Session logs (OpenClaw-style)
- Index: `src/brain/db/sessions/sessions.json`
- Per-session transcript/events: `src/brain/db/sessions/<sessionId>.jsonl`
- Store: `src/runtime/storage/session-log-store.ts`

### Memory logs
- Daily notes: `src/brain/db/memory/YYYY-MM-DD.md`
- Long-term notes: `src/brain/db/memory/MEMORY.md`
- Store: `src/runtime/storage/memory-log-store.ts`

### Wallet output artifacts
- Default keypair output: `src/brain/protected/keypairs/`

---

## AI Layer

`src/ai/` is now a single public surface (`src/ai/index.ts`) with three subareas:

- `contracts/` — shared runtime interfaces
- `core/` — registry/dispatcher/scheduler/event-bus/policy-engine/state-store
- `llm/` — OpenAI-backed client and prompt loading

LLM client is optional and only enabled if `OPENAI_API_KEY` is present.

---

## Solana Layer

`src/solana/`:

- `adapters/`:
  - `jupiter-ultra.ts`
  - `token-account.ts`
  - `ultra-signer.ts`
  - other adapter scaffolds retained
- `actions/`:
  - data-based RPC/API helpers
  - wallet-based swap + wallet creation
- `routines/`:
  - `create-wallets`
  - `action-sequence`
- `wallet/`:
  - wallet policy/types/encryption scaffolding
  - hard deletion guard in `wallet-manager.ts`

---

## Folder Map (Current)

```text
src/
  apps/
    cli/
  ai/
    contracts/
    core/
    llm/
  brain/
    protected/settings/
    db/
    rules.md
    soul.md
    system-prompt.md
  runtime/
    bootstrap.ts
    config/
    storage/
  solana/
    adapters/
    actions/
    routines/
    wallet/
```

---

## Testing Status

Active tests for runtime core/storage:
- `src/runtime/bootstrap.test.ts`
- `src/runtime/storage/sqlite-state-store.test.ts`
- `src/runtime/storage/session-log-store.test.ts`
- `src/runtime/storage/memory-log-store.test.ts`

---

## Known Gaps

1. Many Solana modules remain scaffold/spec-heavy.
2. Trigger subsystem is not fully production-wired yet.
3. CLI/TUI views are still mostly placeholders.
4. Wallet full lifecycle implementation is incomplete (guardrails exist, full manager/store behavior still evolving).
