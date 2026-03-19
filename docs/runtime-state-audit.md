# Runtime State Audit

This document explains which ignored/generated paths are part of the TrenchClaw contract, which ones are cache or local noise, what must exist for a fresh install, and what is shared across all instances versus scoped to one instance.

## Ignore Audit

| Path or pattern | Source of truth | Required for runtime/build | How it is created | Notes |
| --- | --- | --- | --- | --- |
| `node_modules/` | package manager | yes | `bun install` | dependency install, not app state |
| `.turbo/` | Turbo cache | no | Turbo | cache only |
| `apps/trenchclaw/.runtime-state/` | runtime contract | yes | runner/bootstrap and runtime activity | main local state root in workspace mode |
| `*.db`, `*.sqlite`, `*-wal`, `*-shm` | runtime storage | yes | runtime bootstrap, scheduler, SQLite | under `.runtime-state/instances/<id>/data/` and `.runtime-state/instances/<id>/cache/` |
| `**/dist/` | build output | yes for release/build flows | app/gui/core build scripts | safe to delete and rebuild |
| `website/.svelte-kit/` | SvelteKit cache | no | website dev/typecheck/build | cache/build helper |
| `website/build/` | website static output | yes for website build | `bun run website:build` | build artifact |
| `website/.vercel` | Vercel local metadata | no | Vercel CLI/local tooling | not part of runtime contract |
| `apps/trenchclaw/out`, `coverage`, `.cache`, `*.tsbuildinfo`, `*.log` | local tool output | no | local tooling | cleanup value depends on workflow |

## Fresh Install

These are the paths a brand new local install needs. Some should be created eagerly, some can remain lazy.

### Current Runtime-global

Must exist immediately or during first runtime boot:

- `.runtime-state/instances/`
- `.trenchclaw-generated/`

Files created eagerly or on first access:

- `.runtime-state/instances/active-instance.json`
- `.trenchclaw-generated/workspace-context.md`
- `.trenchclaw-generated/knowledge-index.md`

### Current Per-instance

For a newly created or first-signed-in instance `NN`, the runtime should ensure:

- `.runtime-state/instances/NN/instance.json`
- `.runtime-state/instances/NN/secrets/vault.json`
- `.runtime-state/instances/NN/keypairs/`
- `.runtime-state/instances/NN/settings/`
- `.runtime-state/instances/NN/settings/ai.json`
- `.runtime-state/instances/NN/settings/settings.json`
- `.runtime-state/instances/NN/settings/trading.json`
- `.runtime-state/instances/NN/data/`
- `.runtime-state/instances/NN/logs/live/`
- `.runtime-state/instances/NN/logs/sessions/`
- `.runtime-state/instances/NN/logs/summaries/`
- `.runtime-state/instances/NN/logs/system/`
- `.runtime-state/instances/NN/cache/memory/`
- `.runtime-state/instances/NN/workspace/`
- `.runtime-state/instances/NN/workspace/routines/`
- `.runtime-state/instances/NN/shell-home/`
- `.runtime-state/instances/NN/tmp/`
- `.runtime-state/instances/NN/tool-bin/`

Created lazily later:

- `.runtime-state/instances/NN/data/runtime.db`
- `.runtime-state/instances/NN/cache/queue.sqlite`
- `.runtime-state/instances/NN/keypairs/wallet-library.jsonl`
- `.runtime-state/instances/NN/keypairs/<group>/...`
- any future per-instance workspace, notes, or output paths

## Current Ownership Model

### Runtime-global

- `.runtime-state/instances/active-instance.json`
- `.trenchclaw-generated/`

### Per-instance

- `.runtime-state/instances/<id>/instance.json`
- `.runtime-state/instances/<id>/secrets/vault.json`
- `.runtime-state/instances/<id>/settings/ai.json`
- `.runtime-state/instances/<id>/settings/settings.json`
- `.runtime-state/instances/<id>/settings/trading.json`
- `.runtime-state/instances/<id>/data/runtime.db`
- `.runtime-state/instances/<id>/cache/queue.sqlite`
- `.runtime-state/instances/<id>/logs/sessions/`
- `.runtime-state/instances/<id>/logs/summaries/`
- `.runtime-state/instances/<id>/logs/system/`
- `.runtime-state/instances/<id>/logs/live/`
- `.runtime-state/instances/<id>/cache/memory/`
- `.runtime-state/instances/<id>/keypairs/`
- `.runtime-state/instances/<id>/workspace/`
- `.runtime-state/instances/<id>/shell-home/`
- `.runtime-state/instances/<id>/tmp/`
- `.runtime-state/instances/<id>/tool-bin/`
- wallet libraries and managed wallet files under the instance keypair root

### Mixed behavior worth revisiting later

- Generated prompt/context artifacts remain shared across instances.

## Rule Of Thumb

Use this ownership rule unless there is a strong reason not to:

- Put infrastructure, cache, and derived artifacts in runtime-global state.
- Put identity, spend authority, strategy behavior, and operator-specific state in per-instance state.

That means:

### Keep shared

- generated prompt/context artifacts
- knowledge manifests and default knowledge files
- release metadata and bundled readonly assets

### Make per-instance

- every vault secret
- wallet private keys and signer material
- AI provider/model settings
- compatibility settings
- trading preferences and execution defaults
- runtime SQLite state, queue state, session state, and memory state
- strategy files that describe what one instance should do
- long-lived notes or workspace outputs that belong to one bot/operator
- any state that can spend money, sign transactions, impersonate an operator, or materially change external side effects

## Vault Rule

Vaults are per-instance only.

- Active/default vault path in workspace mode: `.runtime-state/instances/<id>/secrets/vault.json`
- No shared runtime vault fallback
- No shared runtime `ai.json` fallback
- No shared runtime `settings.json` fallback
- No shared secret overlay
- `TRENCHCLAW_VAULT_FILE` remains an explicit override for tests and controlled manual runs only

Practical consequence:

- LLM keys are per-instance
- AI provider/model settings are per-instance
- compatibility settings are per-instance
- RPC provider keys are per-instance
- Jupiter keys are per-instance
- signer keys are per-instance

If you want many instances to share the same secret, duplicate it intentionally. The runtime should not do that implicitly.

## New Instance Contract

A fresh instance must be able to sign in and work without manual file scaffolding. The runtime now creates these automatically:

- `instances/<id>/secrets/vault.json`
- `instances/<id>/keypairs/`
- `instances/<id>/settings/`
- `instances/<id>/settings/trading.json`

The remaining shared runtime bootstrap contract stays global:

- generated prompt files
- shared knowledge manifests and shared default knowledge

## Bloat To Remove Or Avoid

Current avoidable overhead:

- stale `dist/release*` output trees
- compatibility code that tries to merge shared and per-instance vaults
- any docs/prompts that reintroduce shared vault paths

Do not add back:

- shared secret fallback paths
- overlay merge logic for vaults
- duplicate vault parsing implementations in adapters or GUI domains
