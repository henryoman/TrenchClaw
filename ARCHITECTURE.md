# TrenchClaw Architecture

This file reflects the repository as it exists now (monorepo layout, package boundaries, runtime wiring, and currently active surfaces).

## Monorepo Layout

- Root workspace (`package.json`) uses Turbo + Bun.
- Workspaces:
  - `apps/trenchclaw` (`@trenchclaw/core`)
  - `apps/frontends/cli` (`@trenchclaw/cli`)
  - `apps/frontends/gui` (`@trenchclaw/web-gui`)
  - `apps/types`

Top-level supporting directories:
- `tests/` (runtime, AI, solana action/routine tests)
- `docs/` (storage schema and examples)
- `deploy/systemd/` (service/env templates)
- `scripts/systemd/install.ts` (installer)
- `lib/client/idl/` (IDL JSONs)

## Runtime Entry Path

- User commands are exposed at root (`bun run dev|start|headless|cli`) and routed by Turbo to `@trenchclaw/cli`.
- CLI entrypoint: `apps/frontends/cli/index.ts`.
- Runtime bootstrap: `apps/trenchclaw/src/runtime/bootstrap.ts`.

Boot sequence in current code:
1. Parse mode/profile inputs in CLI.
2. Load runtime settings (`safe | dangerous | veryDangerous`).
3. Bootstrap runtime core/services.
4. Start HTTP runtime server (`/`, `/health`) plus `/api/gui/*` endpoints.
5. Start scheduler loop.

## Runtime Composition

`apps/trenchclaw/src/runtime/bootstrap.ts` currently wires:
- `ActionRegistry`
- `PolicyEngine` (runtime settings gate)
- `ActionDispatcher`
- `Scheduler`
- `StateStore` (`SqliteStateStore` or `InMemoryStateStore`)
- `InMemoryRuntimeEventBus`
- Optional LLM client (from env)
- Solana adapters:
  - `jupiter-ultra`
  - `token-account`
  - `ultra-signer`
- File/session/memory/system/summary logging stores

## Actions

Codebase action modules exist under `apps/trenchclaw/src/solana/actions/**`.

Actions that are actually registered are decided at runtime by settings (`buildActionCatalog`):
- Always:
  - `createWallets`
  - `renameWallets`
  - `queryRuntimeStore`
- When trading enabled:
  - `createBlockchainAlert`
- When signing + transfer limits allow:
  - `transfer`
  - `privacyTransfer`
  - `privacyAirdrop`
- When Jupiter Ultra enabled:
  - `ultraQuoteSwap`
  - `ultraExecuteSwap`
  - `ultraSwap`
- When both Ultra + signing/limits allow:
  - `privacySwap`

Important: other action files exist (for example RPC swap/token/read-only helpers), but they are not all auto-registered in bootstrap.

## Routines and Triggers

Routines exported in `apps/trenchclaw/src/solana/routines/index.ts`:
- `dca`
- `create-wallets`
- `action-sequence`

Routines currently supported by the scheduler resolver in bootstrap:
- `createWallets`
- `actionSequence`

Triggers exist in `apps/trenchclaw/src/solana/triggers/`:
- `timer`
- `price`
- `on-chain`

Trigger modules are present and exported, but not directly wired by `bootstrapRuntime()` today.

## Settings, Policy, and Safety

Settings loader path:
- `apps/trenchclaw/src/runtime/load/loader.ts`

Schema:
- `apps/trenchclaw/src/runtime/load/schema.ts`

Authority/sanitization rules:
- `apps/trenchclaw/src/runtime/load/authority.ts`

Bundled safety profiles:
- `apps/trenchclaw/src/ai/brain/protected/system/safety-modes/safe.yaml`
- `apps/trenchclaw/src/ai/brain/protected/system/safety-modes/dangerous.yaml`
- `apps/trenchclaw/src/ai/brain/protected/system/safety-modes/veryDangerous.yaml`

Merge order in loader:
1. Base profile file
2. Agent override (`TRENCHCLAW_SETTINGS_AGENT_FILE`) after profile-based sanitization
3. User override (`TRENCHCLAW_SETTINGS_USER_FILE`)
4. User-protected path enforcement
5. Normalization + Zod validation

## Storage and Logging

Storage implementation lives in:
- `apps/trenchclaw/src/runtime/storage/*`

Default normalized settings currently point to:
- SQLite DB: `src/ai/brain/db/runtime.sqlite`
- Event files: `src/ai/brain/db/events`
- Sessions: `src/ai/brain/db/sessions`
- Memory: `src/ai/brain/db/memory`

SQLite tables include:
- `jobs`
- `action_receipts`
- `policy_hits`
- `decision_logs`
- `conversations`
- `chat_messages`
- `market_instruments`
- `ohlcv_bars`
- `market_snapshots`
- `http_cache`
- `schema_migrations`

Active stores in runtime:
- `SqliteStateStore`
- `RuntimeFileEventLog`
- `SessionLogStore`
- `SessionSummaryStore`
- `MemoryLogStore`
- `SystemLogStore`
- `SummaryLogStore`

## AI and Solana Package Surfaces

`apps/trenchclaw/src/ai/` exports:
- `runtime` types
- `core` runtime engine pieces
- `llm` client/config/prompt loaders

`apps/trenchclaw/src/solana/` exports:
- `lib/adapters`
- `lib/wallet`
- `actions`
- `routines`
- `triggers`

## Frontends

CLI package:
- `apps/frontends/cli/index.ts`
- view modules in `apps/frontends/cli/views/*`
- runtime HTTP + GUI API adapter in `apps/frontends/cli/web-gui.ts`

Web GUI package:
- Svelte + Vite app in `apps/frontends/gui/src/*`
- build output generated locally in `apps/frontends/gui/dist/*` (not tracked)

## Tests Present

Current tests under `tests/`:
- AI: config + prompt loader
- Runtime: bootstrap, authority, storage stores
- Solana: alerts/query runtime store, wallet creation/rename, create-wallets routine
