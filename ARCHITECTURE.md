# TrenchClaw Architecture

This is the short architecture file the model should read first.

## Repo Shape

- `apps/trenchclaw`
  - core runtime
  - settings load
  - actions
  - chat/tool exposure
  - runtime server

- `apps/frontends/gui`
  - GUI client
  - reads runtime HTTP APIs
  - does not own state

- `apps/runner`
  - packaged app launcher
  - starts runtime and serves GUI in bundled runs

- `tests`
  - runtime, wallet, prompt, and transport tests

## Runtime Flow

The runtime boots in `apps/trenchclaw/src/runtime/bootstrap.ts`.

Main order:

1. load settings
2. load storage
3. build capability snapshot
4. build LLM client
5. register actions
6. start scheduler
7. start chat/runtime services

## What The Model Can Use

The model does not get arbitrary repo power.

It uses:

- runtime actions exposed in the capability appendix
- `workspaceBash`
- `workspaceReadFile`
- `workspaceWriteFile`

If a tool name is not in the injected runtime tool catalog, it is not callable.

## Source Of Truth Files

### Runtime state

- `.runtime-state/runtime/ai.json`
- `.runtime-state/runtime/settings.json`
- `.runtime-state/instances/<id>/instance.json`
- `.runtime-state/instances/<id>/vault.json`
- `.runtime-state/instances/<id>/settings/trading.json`

### Runtime code

- `src/runtime/bootstrap.ts`
- `src/runtime/chat.ts`
- `src/runtime/capabilities/`
- `src/runtime/load/`
- `src/runtime/security/`

### Wallet code

- `src/solana/lib/wallet/`
- `src/solana/actions/wallet-based/`

## Instance Rules

- instance ids are `01`, `02`, `03`, ...
- instance display name comes from `instances/<id>/instance.json`
- there is no legacy flat instance format
- there is no directory-name fallback

## Wallet Rules

- wallet files live under `.runtime-state/instances/<id>/keypairs/`
- managed wallet index is `wallet-library.jsonl`
- prefer runtime actions over manual wallet file edits

## Settings Rules

- `ai.json` selects provider and model
- `vault.json` stores secrets
- runtime-owned settings win over agent overlays for protected paths
- active instance trading settings apply only to the active instance

## Model Reading Order

When solving runtime tasks, read in this order:

1. injected runtime capability appendix
2. injected resolved runtime settings
3. `src/ai/brain/rules.md`
4. `src/ai/brain/knowledge/*.md`
5. exact source files you need
