# Runtime State Audit

This document explains which ignored/generated paths are part of the real TrenchClaw contract, which ones are cache or local noise, what must exist for a fresh install, and how to decide whether state belongs to the whole runtime or to a single instance.

## Ignore Audit

| Path or pattern | Source of truth | Required for runtime/build | How it is created | Notes |
| --- | --- | --- | --- | --- |
| `node_modules/` | package manager | yes | `bun install` | dependency install, not app state |
| `.turbo/` | Turbo cache | no | Turbo | cache only |
| `apps/trenchclaw/.runtime-state/` | runtime contract | yes | runner/bootstrap and runtime activity | main local state root in workspace mode |
| `*.db`, `*.sqlite`, `*-wal`, `*-shm` | runtime storage | yes | runtime bootstrap, scheduler, SQLite | mostly under `.runtime-state/db/` now |
| `**/dist/` | build output | yes for release/build flows | app/gui/core build scripts | safe to delete and rebuild |
| `website/.svelte-kit/` | SvelteKit cache | no | website dev/typecheck/build | cache/build helper |
| `website/build/` | website static output | yes for website build | `bun run website:build` | build artifact |
| `website/.vercel` | Vercel local metadata | no | Vercel CLI/local tooling | not part of runtime contract |
| `apps/trenchclaw/out`, `coverage`, `.cache`, `*.tsbuildinfo`, `*.log` | local tool output | no | local tooling | cleanup value depends on workflow |

## Fresh Install

These are the paths a brand new local install needs. Some should be created eagerly, some can remain lazy.

### Runtime-global

Must exist immediately or during first runtime boot:

- `.runtime-state/db/`
- `.runtime-state/db/events/`
- `.runtime-state/db/sessions/`
- `.runtime-state/db/memory/`
- `.runtime-state/db/queue/`
- `.runtime-state/runtime/`
- `.runtime-state/runtime/workspace/`
- `.runtime-state/runtime/workspace/routines/`
- `.runtime-state/instances/`
- `.runtime-state/generated/`

Files created eagerly or on first access:

- `.runtime-state/runtime/settings.json`
- `.runtime-state/runtime/ai.json`
- `.runtime-state/runtime/vault.json`
- `.runtime-state/generated/workspace-context.md`
- `.runtime-state/generated/knowledge-manifest.md`

Files created lazily by normal use:

- `.runtime-state/db/runtime.sqlite`
- `.runtime-state/db/queue/bunqueue.sqlite`
- `.runtime-state/db/sessions/*`
- `.runtime-state/db/memory/*`
- `.runtime-state/db/system/*`
- `.runtime-state/db/summary/*`

### Per-instance

For a newly created or first-signed-in instance `NN`, the runtime should ensure:

- `.runtime-state/instances/NN/instance.json`
- `.runtime-state/instances/NN/keypairs/`
- `.runtime-state/instances/NN/settings/`
- `.runtime-state/instances/NN/settings/trading.json`

Created lazily later:

- `.runtime-state/instances/NN/keypairs/wallet-library.jsonl`
- `.runtime-state/instances/NN/keypairs/<group>/...`
- any future per-instance vault or workspace paths

## Current Ownership Model

### Runtime-global today

- `.runtime-state/db/`
- `.runtime-state/generated/`
- `.runtime-state/runtime/settings.json`
- `.runtime-state/runtime/ai.json`
- `.runtime-state/runtime/vault.json`
- `.runtime-state/runtime/workspace/`

### Per-instance today

- `.runtime-state/instances/<id>/instance.json`
- `.runtime-state/instances/<id>/settings/trading.json`
- `.runtime-state/instances/<id>/keypairs/`
- wallet libraries and managed wallet files under the instance keypair root

### Mixed behavior worth fixing over time

- The SQLite runtime DB is global, but many records are logically instance-scoped via `instanceId`.
- Runtime workspace is global, even though user workflows often feel instance-specific.
- Vault is global, even though some secrets are harmless to share and others clearly are not.

## Rule Of Thumb

Use this ownership rule unless there is a strong reason not to:

- Put infrastructure, cache, and derived artifacts in runtime-global state.
- Put identity, spend authority, strategy behavior, and operator-specific state in per-instance state.

That means:

### Keep shared

- generated prompt/context artifacts
- SQLite/system/session caches
- provider defaults that are identical for every instance
- read-only or low-risk infra credentials when all instances intentionally share them

### Make per-instance

- wallet private keys and signer material
- trading preferences and execution defaults
- strategy files that describe what this instance should do
- long-lived notes or workspace outputs that are meant to belong to one bot/operator
- any secret that can spend money, sign transactions, impersonate an operator, or materially change external side effects

## Vault Recommendation

Best default model:

1. Keep a shared runtime vault for infra defaults.
2. Add an optional per-instance vault overlay at `.runtime-state/instances/<id>/vault.json`.
3. Resolve secrets in this order: instance vault -> runtime vault -> checked-in template defaults.

Practical split:

- Shared vault: LLM provider keys, default RPC provider keys, read-only analytics/API keys.
- Per-instance vault: ultra signer keys, wallet export/import secrets, any trading identity that should not leak across instances, any key that can spend or commit.

If a key would be dangerous to reuse silently across instances, it should not live only in the shared vault.

## Next Refactor Order

Lowest-risk next steps:

1. Keep generated/context/db state global.
2. Keep wallet storage per-instance.
3. Introduce per-instance vault overlay without removing the shared runtime vault.
4. Decide whether `runtime/workspace/` should become `instances/<id>/workspace/` or stay shared with explicit subfolders.

Do not flip everything to per-instance at once. Derived files and caches are cheaper to share. Spend authority and behavior are not.
