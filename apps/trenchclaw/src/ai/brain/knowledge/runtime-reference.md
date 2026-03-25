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

- `src/runtime/chat/service.ts`
  - exposes registered runtime actions and workspace tools to the model

- `src/tools/`
  - defines the registered runtime actions and workspace tools
  - computes the runtime tool snapshot for the current settings
  - provides the tool metadata injected into prompts and model registrations

- `src/runtime/settings/`
  - loads runtime settings
  - merges base settings and active-instance settings
  - enforces authority boundaries

- `src/runtime/security/`
  - filesystem policy
  - write scope checks

## Shell Execution Model

TrenchClaw currently has three different execution classes and they must not be
confused:

- trusted internal repo scripts
  - examples: `bun run scripts/*.ts`, build scripts, release scripts, local dev
    bootstrap
  - these are allowed to use normal host execution such as `Bun.spawn` and
    `bun run`
  - these are trusted developer workflows, not an isolation boundary

- current runtime workspace shell
  - exposed through `workspaceBash`
  - this is a policy-constrained host shell rooted at the active instance
    workspace
  - it restricts cwd, sanitizes commands, shapes `PATH`, blocks some dangerous
    patterns, and blocks mutating commands by default
  - it is useful for inspection and trusted CLI utility work
  - it is not a proper VM or container boundary and should not be described as
    true secure execution for untrusted bash or TypeScript

- recommended future isolated exec backend
  - this is the correct target shape for model-driven bash and TypeScript that
    should not touch the host shell directly
  - required properties:
    - isolated filesystem view
    - explicit execution limits and timeout
    - network policy or egress allowlist
    - TypeScript/JavaScript execution without direct host `bun run`
  - for TrenchClaw this does not need to mean a full VM
  - the preferred default is a lightweight in-process sandbox such as
    `just-bash` or another custom `bash-tool` sandbox implementation
  - a full VM should be optional, only for cases that truly require arbitrary
    native binaries or a stronger boundary

## Runtime State Roots

The repo tracks the intended layout under `.runtime/`.

The runtime writes mutable state to `.runtime-state/instances/`, including per-instance generated prompt-support artifacts under `cache/generated/`.

For local development, `bun run dev` defaults to a persistent external runtime root:

- `~/.trenchclaw-dev-runtime`

That external root is the preferred dev/test manual workflow because it preserves real per-instance behavior without putting personal state in the repo.

For packaged releases, the shipped bundle is readonly app content only. Mutable runtime state is created on first run under `~/.trenchclaw` by default or under the absolute path set through `TRENCHCLAW_RUNTIME_STATE_ROOT`.

That means users should receive clean generated runtime files such as:

- `instances/active-instance.json`
- `instances/<id>/instance.json`
- `instances/<id>/settings/ai.json`
- `instances/<id>/settings/settings.json`
- `instances/<id>/settings/trading.json`
- `instances/<id>/secrets/vault.json`

The bundle must not include developer-local or user-personal state such as:

- populated vault secrets
- wallet keypairs
- runtime databases
- logs, summaries, or cache artifacts
- developer home-directory paths

Important directories:

- `.runtime-state/instances/active-instance.json`
  - selected instance pointer only, currently `{ "localInstanceId": "NN" }`

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

- `.runtime-state/instances/<id>/cache/generated/`
  - `workspace-context.md`
  - `knowledge-index.md`

## Active Instance Rules

- Active instance selection comes from `.runtime-state/instances/active-instance.json`
- `active-instance.json` is a selector, not a cached copy of the whole profile
- Instance identity comes from `.runtime-state/instances/<id>/instance.json`
- Display name comes from `instance.name`
- There is no legacy flat instance file format
- There is no fallback name derived from directory names
- New GUI-created instances allocate from `00`, then `01`, `02`, and so on

## Model Operating Rule

If you need runtime truth:

1. trust the injected runtime tool snapshot and registered tool definitions
2. trust the injected live runtime context section for the current clock and shared backend SOL price snapshot
3. trust the injected release-readiness section over bundled docs, knowledge files, or source references
4. trust injected resolved settings
5. for local dev, assume the mutable runtime root may be an external directory selected by `TRENCHCLAW_RUNTIME_STATE_ROOT`
6. for packaged releases, assume readonly app assets ship separately from mutable runtime state and that first-run defaults are generated into the runtime root
7. use workspace tools only inside `.runtime-state/instances/<active-id>/workspace/` or the equivalent external runtime root
8. do not treat core repo source files as part of the runtime workspace tool surface
9. do not treat `.runtime/` as mutable state
10. never imply that developer-local vaults, wallets, logs, or databases ship to end users
11. if a feature is not listed as shipped or limited beta, describe it as coming soon instead of guessing
12. do not describe `workspaceBash` as a true sandbox or secure exec boundary; today it is a policy-constrained host shell
13. prefer typed runtime actions over shell commands whenever an action already exists
14. for model-driven bash or TypeScript execution, prefer a lightweight
    in-process sandbox with isolated filesystem, network allowlists, and
    execution limits rather than direct host bash
15. reserve host-shell execution for trusted internal scripts and explicitly
    curated native CLI passthroughs
