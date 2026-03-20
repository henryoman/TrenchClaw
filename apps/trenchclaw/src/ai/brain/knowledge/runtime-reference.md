# Runtime Reference

## Purpose

This file explains the current runtime shape in the smallest possible form.

## Main Runtime Pieces

- `src/runtime/bootstrap.ts`
  - builds the runtime
  - loads settings
  - loads storage
  - registers actions
  - starts scheduler/chat services

- `src/runtime/chat.ts`
  - exposes runtime actions and workspace tools to the model

- `src/runtime/capabilities/`
  - defines what actions exist
  - defines what is exposed to chat
  - generates the capability appendix injected into the prompt

- `src/runtime/load/`
  - loads runtime settings
  - merges base settings and active-instance settings
  - enforces authority boundaries

- `src/runtime/security/`
  - filesystem policy
  - write scope checks

## Runtime State Roots

The repo tracks the intended layout under `.runtime/`.

The runtime writes mutable state to `.runtime-state/instances/` and generated prompt-support artifacts to `.trenchclaw-generated/`.

For local development, `bun run dev` defaults those roots to persistent external directories:

- `~/trenchclaw-dev-runtime`
- `~/trenchclaw-dev-generated`

Those external roots are the preferred dev/test manual workflow because they preserve real per-instance behavior without putting personal state in the repo.

Important directories:

- `.runtime-state/instances/active-instance.json`
  - selected instance pointer

- `.runtime-state/instances/<id>/`
  - `instance.json`
  - `settings/ai.json`
  - `settings/settings.json`
  - `settings/trading.json`
  - `secrets/vault.json`
  - `data/runtime.db`
  - `logs/live/*.console.jsonl`
  - `logs/sessions/index.json`
  - `logs/sessions/<session-id>.jsonl`
  - `logs/sessions/<session-id>.summary.json`
  - `logs/summaries/*.summary.jsonl`
  - `logs/system/*.system.jsonl`
  - `cache/`
  - `keypairs/`
  - `workspace/`

- `.trenchclaw-generated/`
  - `workspace-context.md`
  - `knowledge-index.md`

## Active Instance Rules

- Active instance selection comes from `.runtime-state/instances/active-instance.json`
- Instance identity comes from `.runtime-state/instances/<id>/instance.json`
- Display name comes from `instance.name`
- There is no legacy flat instance file format
- There is no fallback name derived from directory names

## Model Operating Rule

If you need runtime truth:

1. trust the injected capability appendix
2. trust the injected live runtime context section for the current clock and shared backend SOL price snapshot
3. trust the injected release-readiness section over bundled docs, knowledge files, or source references
4. trust injected resolved settings
5. for local dev, assume the mutable runtime root may be an external directory selected by `TRENCHCLAW_RUNTIME_STATE_ROOT`
6. use workspace tools only inside `.runtime-state/instances/<active-id>/workspace/` or the equivalent external runtime root
7. do not treat core repo source files as part of the runtime workspace tool surface
8. do not treat `.runtime/` as mutable state
9. if a feature is not listed as shipped or limited beta, describe it as coming soon instead of guessing
