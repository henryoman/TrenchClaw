# Runtime State Audit

This document explains which ignored/generated paths are part of the TrenchClaw contract, which ones are cache or local noise, what must exist for a fresh install, and what is shared across all instances versus scoped to one instance.

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
- `.runtime-state/instances/NN/vault.json`
- `.runtime-state/instances/NN/keypairs/`
- `.runtime-state/instances/NN/settings/`
- `.runtime-state/instances/NN/settings/trading.json`

Created lazily later:

- `.runtime-state/instances/NN/keypairs/wallet-library.jsonl`
- `.runtime-state/instances/NN/keypairs/<group>/...`
- any future per-instance workspace or notes paths

## Current Ownership Model

### Runtime-global

- `.runtime-state/db/`
- `.runtime-state/generated/`
- `.runtime-state/runtime/settings.json`
- `.runtime-state/runtime/ai.json`
- `.runtime-state/runtime/workspace/`

### Per-instance

- `.runtime-state/instances/<id>/instance.json`
- `.runtime-state/instances/<id>/vault.json`
- `.runtime-state/instances/<id>/settings/trading.json`
- `.runtime-state/instances/<id>/keypairs/`
- wallet libraries and managed wallet files under the instance keypair root

### Mixed behavior worth revisiting later

- The SQLite runtime DB is global, but many records are logically instance-scoped via `instanceId`.
- Runtime workspace is global, even though some workflows may later want per-instance workspaces.

## Rule Of Thumb

Use this ownership rule unless there is a strong reason not to:

- Put infrastructure, cache, and derived artifacts in runtime-global state.
- Put identity, spend authority, strategy behavior, and operator-specific state in per-instance state.

That means:

### Keep shared

- generated prompt/context artifacts
- SQLite/system/session caches
- knowledge manifests and default knowledge files
- runtime-wide workspace artifacts that are intentionally shared across all instances

### Make per-instance

- every vault secret
- wallet private keys and signer material
- trading preferences and execution defaults
- strategy files that describe what one instance should do
- long-lived notes or workspace outputs that belong to one bot/operator
- any state that can spend money, sign transactions, impersonate an operator, or materially change external side effects

## Vault Rule

Vaults are per-instance only.

- Active/default vault path in workspace mode: `.runtime-state/instances/<id>/vault.json`
- No shared runtime vault fallback
- No shared secret overlay
- `TRENCHCLAW_VAULT_FILE` remains an explicit override for tests and controlled manual runs only

Practical consequence:

- LLM keys are per-instance
- RPC provider keys are per-instance
- Jupiter keys are per-instance
- signer keys are per-instance

If you want many instances to share the same secret, duplicate it intentionally. The runtime should not do that implicitly.

## New Instance Contract

A fresh instance must be able to sign in and work without manual file scaffolding. The runtime now creates these automatically:

- `instances/<id>/vault.json`
- `instances/<id>/keypairs/`
- `instances/<id>/settings/`
- `instances/<id>/settings/trading.json`

The remaining shared runtime bootstrap contract stays global:

- generated prompt files
- runtime DB roots
- runtime settings
- AI provider/model settings
- shared knowledge manifests and shared default knowledge

## Bloat To Remove Or Avoid

Current avoidable overhead:

- stale `dist/release*` output trees
- compatibility code that tries to merge shared and per-instance vaults
- docs/prompts that still describe `.runtime-state/runtime/vault.json`

Do not add back:

- shared secret fallback paths
- overlay merge logic for vaults
- duplicate vault parsing implementations in adapters or GUI domains
