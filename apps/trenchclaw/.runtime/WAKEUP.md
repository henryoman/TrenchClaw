# WAKEUP

This file is the TrenchClaw runtime wake-up contract.

It is the runtime-side analogue to OpenClaw's `HEARTBEAT.md`:

- `HEARTBEAT.md` is for periodic agent awareness.
- `WAKEUP.md` is for runtime boot, restart, crash recovery, and post-downtime resume behavior.

Keep this file small, stable, prompt-safe, and implementation-oriented.

Do not put secrets, machine-local paths, wallet material, or one-off debugging notes here.

## Why this exists

TrenchClaw is not just a chat loop. It owns durable runtime state, per-instance secrets, queue state, logs, SQLite storage, and eventually more autonomous routines. That makes wake-up behavior part of the product contract, not an implementation detail.

When the runtime wakes up, it must answer these questions deterministically:

- Which instance is active?
- Which state is authoritative?
- Which jobs are safe to resume?
- Which jobs should stay paused, fail closed, or require operator review?
- What operator-visible notices must be written before dangerous work resumes?

## Current shipped behavior

The current boot path is spread across the runtime code and already does a meaningful amount of wake-up work:

1. Resolve the active instance and fail closed if none is selected.
2. Ensure the instance layout exists under per-instance runtime state.
3. Migrate legacy runtime-global state into the active instance when legacy roots are found.
4. Refresh generated bootstrap context artifacts when missing or when boot-refresh env flags request it.
5. Open runtime storage, logs, session state, and memory state.
6. If SQLite is enabled, sync schema, recover interrupted `running` jobs back to `pending`, and prune retained runtime data.
7. Build the action registry, policy engine, dispatcher, gateway, and scheduler.
8. Start the scheduler and append boot markers to summary, session, memory, and system logs.

Important current code paths:

- `apps/trenchclaw/src/runtime/bootstrap.ts`
- `apps/trenchclaw/src/runtime/instance-layout.ts`
- `apps/trenchclaw/src/runtime/instance-state.ts`
- `apps/trenchclaw/src/runtime/runtime-state-migration.ts`
- `apps/trenchclaw/src/runtime/load/loader.ts`
- `apps/trenchclaw/src/runtime/storage/sqlite-state-store.ts`
- `apps/trenchclaw/src/ai/core/scheduler.ts`

## Wake-up invariants

These rules should stay true even as the scheduler and autonomous loops get more capable:

- No active instance means no runtime boot.
- Mutable runtime state is instance-scoped unless there is an explicit runtime-global contract.
- Wake-up must be safe-by-default, not optimistic-by-default.
- Trading, signing, transfer, and other money-moving work must never resume blindly.
- Logs and notices should explain what resumed, what was skipped, and why.
- Recovery should prefer idempotent reconciliation over replaying unknown side effects.
- A crash or restart must not silently erase operator context.

## Wake-up sequence contract

Whenever the runtime boots or regains control after downtime, the intended sequence is:

1. Resolve identity and storage authority.
   Confirm the active instance and runtime roots before reading or mutating state.
2. Rebuild the filesystem layout.
   Ensure required per-instance directories and baseline files exist.
3. Reconcile storage.
   Open SQLite, sync schema, recover leases, and normalize any legacy state.
4. Rebuild runtime context.
   Reload settings, capability state, generated knowledge/context artifacts, and runtime endpoints.
5. Reconcile queue and scheduler state.
   Classify jobs into `pending`, `paused`, `running`, `failed`, `stopped`, and orphaned/unknown buckets.
6. Run startup health checks.
   Verify critical prerequisites before dangerous execution resumes.
7. Apply resume policy.
   Resume only work that is still safe, still due, and still valid under current settings/policy.
8. Persist wake-up notices.
   Write a durable explanation of what the runtime decided.
9. Start steady-state scheduling.
   Only after the above steps complete should new autonomous execution proceed.

## Resume policy

Current code only performs a coarse recovery step: interrupted `running` jobs in SQLite are rewritten to `pending` with `next_run_at = COALESCE(next_run_at, now)`. That is a reasonable minimum for queue durability, but it is not the full wake-up policy.

The target policy should be:

- Auto-resume read-only and clearly idempotent work when prerequisites are healthy.
- Do not auto-replay a backlog of missed cycles just because the runtime was offline.
- Treat money-moving or signer-dependent jobs as higher-risk than data-fetch jobs.
- Pause or require review when a job's safety assumptions changed while the runtime was offline.
- Surface a wake-up notice before resuming anything that could surprise the operator.
- Prefer one explicit reconciliation decision per job over implicit catch-up storms.

Practical classification to preserve:

- Safe to auto-resume:
  read-only queries, harmless cache rebuilds, internal bookkeeping, prompt-support refreshes.
- Needs policy review before resume:
  swaps, transfers, wallet mutations, signer-dependent routines, future bot loops with external side effects.
- Usually skip or reschedule:
  stale jobs whose intended execution window meaningfully expired during downtime.

## Startup health checks

Before any dangerous work resumes, the runtime should have positive answers for the basics:

- the active instance still exists
- required settings files parse and validate
- required secrets/vault entries are present for the work being resumed
- storage opens cleanly
- runtime endpoints resolve to concrete values
- queue storage is available
- the runtime safety profile still allows the action class being considered

Failing a health check should block or pause resume, not downgrade into best-effort execution.

## Operator-visible notices

Wake-up behavior must leave an audit trail in durable runtime state.

At minimum, the runtime should be able to say:

- booted normally
- migrated legacy state
- recovered interrupted jobs
- resumed job `X`
- skipped job `Y`
- paused job `Z` pending review
- startup health checks failed for reason `R`

These notices belong in the same per-instance observability surfaces the runtime already writes:

- live logs
- system logs
- session history / runtime notices
- summary logs
- memory timeline when relevant

## Scope boundaries

`WAKEUP.md` is about runtime wake-up and resume semantics.

It is not for:

- ad hoc product brainstorming
- long architecture essays
- operator secrets
- transient debugging notes
- channel/message delivery policy

If wake-up behavior depends on another contract, keep the rule here short and point to the implementation surface.

## Near-term gaps

These are the main gaps between today's implementation and the full wake-up contract:

- no explicit missed-schedule policy beyond queue durability
- no first-class boot-time reconciliation pass for orphaned or stale jobs
- no structured wake-up notice model beyond current runtime/system/session logging
- no dangerous-action resume gate dedicated to post-downtime recovery
- no explicit policy for future autonomous loops and strategy bots on restart

## Editing rule

If runtime boot, scheduler recovery, queue durability, or autonomous resume behavior changes, update this file in the same change.
