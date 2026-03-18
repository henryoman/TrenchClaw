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
  - merges base settings, runtime-owned settings, and instance overlays
  - enforces authority boundaries

- `src/runtime/security/`
  - filesystem policy
  - write scope checks

## Runtime State Roots

The runtime writes to `.runtime-state/`.

Important directories:

- `.runtime-state/runtime/`
  - `ai.json`
  - `settings.json`
  - `workspace/`

- `.runtime-state/instances/<id>/`
  - `instance.json`
  - `vault.json`
  - `settings/trading.json`
  - `keypairs/`

- `.runtime-state/generated/`
  - `workspace-context.md`
  - `knowledge-manifest.md`

- `.runtime-state/db/`
  - sqlite and runtime log/state files

## Active Instance Rules

- Active instance identity comes from `.runtime-state/instances/<id>/instance.json`
- Display name comes from `instance.name`
- There is no legacy flat instance file format
- There is no fallback name derived from directory names

## Model Operating Rule

If you need runtime truth:

1. trust the injected capability appendix
2. trust injected resolved settings
3. use workspace tools only inside `.runtime-state/runtime/workspace/`
4. do not treat core repo source files as part of the runtime workspace tool surface
