# TrenchClaw Storage + Logging Plan

_Last updated: 2026-03-19_

## Scope

This document consolidates the storage redesign, logging model, and exact event taxonomy we discussed for **TrenchClaw**.

It is designed to preserve the current strengths of the project while making the storage model easier to reason about:

- one authoritative runtime database
- append-only event/history backbone
- disposable caches and projections
- sandboxed workspaces for agent file work
- **three distinct operator-facing log products** that remain intact:
  - regular instance/console log
  - session transcript + summary log
  - system-level highest-vantage log

## Current repo facts this plan is built around

These points are based on the current public repository and docs as of March 19, 2026:

- The GUI **reads runtime HTTP APIs** and **does not own state**.
- Runtime boot order includes: **load settings -> load storage -> build capability snapshot -> build LLM client -> register actions -> start scheduler -> start chat/runtime services**.
- Current source-of-truth runtime files include:
  - `.runtime-state/instances/<id>/instance.json`
  - `.runtime-state/instances/<id>/secrets/vault.json`
  - `.runtime-state/instances/<id>/settings/ai.json`
  - `.runtime-state/instances/<id>/settings/settings.json`
  - `.runtime-state/instances/<id>/settings/trading.json`
  - `.runtime-state/instances/<id>/data/runtime.db`
  - `.runtime-state/instances/<id>/cache/queue.sqlite`
- Structured event emission already exists for categories like `action:*`, `policy:block`, `queue:*`, and `rpc:failover`, and the repo says those are persisted to SQLite/files/session logs for traceability.
- AgentFS is documented by Turso as an agent-oriented filesystem with copy-on-write isolation, single-file SQLite-backed storage, built-in auditing, and optional cloud sync. The current docs still label it beta/alpha-ish and explicitly advise caution for critical data.

### References

- TrenchClaw repo: <https://github.com/henryoman/trenchclaw>
- TrenchClaw architecture file: <https://github.com/henryoman/trenchclaw/blob/main/ARCHITECTURE.md>
- AgentFS introduction: <https://docs.turso.tech/agentfs/introduction>

---

# 1. Core design decision

## Keep the 3 log products

This plan **does not remove** the three log layers you want.

It keeps and sharpens them:

1. **Instance / regular console log**
   - tactical, live, streamable, human-operational
   - "what is happening right now in this instance?"

2. **Session transcript + summary log**
   - run/session reconstruction and compressed narrative
   - "what happened during this conversation or run?"

3. **System / highest-vantage log**
   - cross-cutting machine governance and meta-state
   - "what changed about the machine, model, runtime, settings, safety posture, and control plane?"

## Change only the underlying backbone

The proposed redesign is:

- **canonical history** comes from one structured event backbone
- **canonical current truth** comes from state tables
- the three log products are **rendered views** over those primitives

That means:

- fewer ambiguities
- easier debugging
- easier retention policies
- easier summary generation
- no loss of operator ergonomics

---

# 2. Recommended storage architecture

## 2.1 Four storage classes

### A. Canonical operational state

This is the authoritative answer to questions like:

- what jobs exist
- what is queued / running / blocked / complete
- what is the current instance state
- what settings are currently effective
- what model/provider is active
- what wallets and execution requests exist right now

**Recommendation:** move to **one authoritative SQLite database per instance**.

Recommended filename:

- `runtime.db`

Instead of maintaining separate authority databases like `runtime.sqlite` and `queue.sqlite`, keep one DB and separate concerns with table families.

### B. Append-only event/history

This is the forensic record.

It answers:

- what happened
- when it happened
- in what order
- why it happened
- what decision or policy led to it
- what the model did
- what the provider did
- what settings changed

This should be primarily append-only.

### C. Derived/cache/projection state

This is convenience state:

- latest token metadata cache
- latest quote cache
- denormalized UI projections
- search helpers
- read-model views

It must be explicitly marked **rebuildable**.

### D. Workspace/artifact state

This is where **AgentFS** is useful.

Use it for:

- temporary research files
- generated CSVs
- screenshots, exports, charts
- draft configs
- temporary code edits
- bash scratch work
- tool/file audit trails inside sandboxed runs

Do **not** make this the canonical trading/execution ledger.

---

# 3. Recommended physical layout

```text
.runtime-state/
  instances/
    01/
      instance.json
      settings/
        ai.json
        settings.json
        trading.json
      secrets/
        vault.json
      data/
        runtime.db
      logs/
        live/
          2026-03-19.console.ndjson
        sessions/
          session-index.json
          <session-id>.jsonl
        summaries/
          <session-id>.md
        system/
          2026-03-19.system.ndjson
      workspaces/
        <run-id>.agentfs.sqlite
      snapshots/
        daily/
        manual/

  global/
    system/
      2026-03-19.system.ndjson
```

## Notes

- `vault.json` should move under `secrets/` for clearer boundary hygiene.
- `db/` becomes `data/`.
- `runtime.db` becomes the single authority DB.
- `logs/` is split by product, not by implementation detail.
- `workspaces/` holds AgentFS sandboxes per run or per task.
- `global/system/` is optional if you want true multi-instance control-plane aggregation.

---

# 4. Runtime DB design

## 4.1 Table families

## Control plane

- `instances`
- `runtime_sessions`
- `runtime_runs`
- `jobs`
- `job_events`
- `scheduler_rules`
- `scheduler_firings`
- `instance_health`
- `instance_mode`

## Policy / safety

- `policy_decisions`
- `policy_blocks`
- `confirmation_requests`
- `risk_limits`
- `idempotency_keys`
- `approval_events`

## Wallet / execution

- `wallets`
- `wallet_labels`
- `execution_requests`
- `execution_attempts`
- `execution_receipts`
- `balance_snapshots`
- `position_snapshots`
- `provider_requests`
- `provider_failovers`

## Chat / agent

- `conversations`
- `messages`
- `model_runs`
- `tool_calls`
- `tool_results`
- `memory_links`
- `summary_jobs`

## Market data / cache

- `token_metadata_cache`
- `quote_cache`
- `price_candles_cache`
- `pool_metadata_cache`

## Artifacts / exports

- `artifacts`
- `artifact_links`
- `reports`
- `export_jobs`

## Event backbone

- `event_log`
- `event_cursor`
- `event_routing_failures`

---

# 5. Keep the three log products exactly, but formalize them

# 5.1 Instance / console log

## Purpose

Immediate operator visibility for one instance.

## Best content type

Tactical runtime flow:

- boot
- settings load
- model/provider selection
- queue transitions
- action execution start/end
- policy allow/block
- quote receipt
- tx submission/confirmation/failure
- provider retries/failover
- warnings/errors

## Storage format

Recommended:

- NDJSON line stream, one record per rendered event

Example path:

- `logs/live/2026-03-19.console.ndjson`

## Important rule

This is a **rendered stream**, not canonical truth.

Canonical truth remains:

- `event_log`
- current-state tables

# 5.2 Session transcript + summary log

## Purpose

Reconstruct one chat/run and provide a human-readable compressed recap.

## Components

### Raw transcript

- `logs/sessions/<session-id>.jsonl`

### Session index

- `logs/sessions/session-index.json`

### Summary artifact

- `logs/summaries/<session-id>.md`

## Important rule

- transcript = raw session trace
- summary = derived human digest

The summary must remain separate from raw trace.

# 5.3 System / highest-vantage log

## Purpose

Cross-cutting control-plane and governance visibility.

This is the top-down machine log.

## Best content type

- settings changes
- active model/provider changes
- capability set changes
- scheduler mode changes
- policy mode changes
- instance start/stop/restart
- queue pressure or backlog threshold events
- migrations or drift warnings
- summary generation lifecycle
- memory compaction / retention events
- security boundary violations
- provider failover and degraded mode transitions

## Storage format

Recommended:

- `logs/system/2026-03-19.system.ndjson`
- optionally aggregate globally under `global/system/`

## Important rule

The system log should contain **strategic/meta events**, not every tactical low-level step.

---

# 6. The exact event backbone model

## 6.1 Event envelope

Every event should use one normalized envelope.

```json
{
  "event_id": "evt_01H...",
  "event_name": "queue.job.started",
  "event_version": 1,
  "occurred_at": "2026-03-19T08:15:24.123Z",
  "instance_id": "01",
  "session_id": "ses_...",
  "run_id": "run_...",
  "job_id": "job_...",
  "action_id": "act_...",
  "execution_id": "exe_...",
  "decision_id": "dec_...",
  "conversation_id": "conv_...",
  "wallet_id": "wal_...",
  "provider": "jupiter_ultra",
  "model": "openai/gpt-5.4-thinking",
  "severity": "info",
  "scope": "instance",
  "route": ["db", "console", "session"],
  "payload": {},
  "tags": ["queue", "execution"],
  "causal_parent_event_id": "evt_prev",
  "idempotency_key": "...",
  "render_hint": "Queue job started"
}
```

## Required fields

- `event_id`
- `event_name`
- `event_version`
- `occurred_at`
- `instance_id`
- `severity`
- `scope`
- `route`
- `payload`

## Strongly recommended correlation fields

- `session_id`
- `run_id`
- `job_id`
- `action_id`
- `execution_id`
- `decision_id`
- `conversation_id`
- `wallet_id`
- `causal_parent_event_id`

## Severity values

- `trace`
- `debug`
- `info`
- `notice`
- `warn`
- `error`
- `critical`

## Scope values

- `instance`
- `session`
- `system`
- `global`

## Route values

- `db`
- `console`
- `session`
- `summary-input`
- `system`
- `metrics`
- `artifact`

---

# 7. Exact event taxonomy

This taxonomy is opinionated and designed specifically for TrenchClaw.

Naming rule:

- `domain.entity.phase`
- lowercase
- dot-separated
- no overloaded verbs

Example:

- `queue.job.started`
- `runtime.settings.changed`
- `model.run.completed`

## 7.1 Runtime lifecycle events

### Boot and process lifecycle

- `runtime.boot.started`
- `runtime.boot.storage_loaded`
- `runtime.boot.settings_loaded`
- `runtime.boot.capabilities_built`
- `runtime.boot.model_client_built`
- `runtime.boot.actions_registered`
- `runtime.boot.scheduler_started`
- `runtime.boot.services_started`
- `runtime.boot.completed`
- `runtime.boot.failed`
- `runtime.shutdown.started`
- `runtime.shutdown.completed`
- `runtime.restart.requested`
- `runtime.restart.completed`

### Health and mode

- `runtime.health.ok`
- `runtime.health.degraded`
- `runtime.health.failed`
- `runtime.mode.changed`
- `runtime.readonly_mode.enabled`
- `runtime.readonly_mode.disabled`
- `runtime.degraded_mode.enabled`
- `runtime.degraded_mode.disabled`

## 7.2 Instance events

- `instance.created`
- `instance.loaded`
- `instance.selected`
- `instance.display_name.changed`
- `instance.lock.acquired`
- `instance.lock.released`
- `instance.snapshot.created`
- `instance.snapshot.restored`
- `instance.snapshot.failed`

## 7.3 Settings and configuration events

### Effective settings lifecycle

- `runtime.settings.load.started`
- `runtime.settings.load.completed`
- `runtime.settings.validation.failed`
- `runtime.settings.changed`
- `runtime.settings.protected_path_blocked`
- `runtime.settings.hash.changed`
- `runtime.settings.persisted`

### Specific settings domains

- `runtime.settings.ai.changed`
- `runtime.settings.trading.changed`
- `runtime.settings.execution.changed`
- `runtime.settings.network.changed`
- `runtime.settings.scheduler.changed`
- `runtime.settings.permissions.changed`
- `runtime.settings.ui_preferences.changed`

### Config drift and migration

- `runtime.schema.migration.started`
- `runtime.schema.migration.completed`
- `runtime.schema.migration.failed`
- `runtime.schema.drift.detected`
- `runtime.schema.auto_sync_applied`
- `runtime.schema.manual_intervention_required`

## 7.4 Secrets and security boundary events

- `security.vault.loaded`
- `security.vault.unlocked`
- `security.vault.locked`
- `security.vault.write_blocked`
- `security.secret.reference_changed`
- `security.filesystem.manifest.loaded`
- `security.filesystem.read_allowed`
- `security.filesystem.read_blocked`
- `security.filesystem.write_allowed`
- `security.filesystem.write_blocked`
- `security.capability.allowed`
- `security.capability.blocked`
- `security.protected_write_policy.blocked`
- `security.policy_mode.changed`
- `security.approval.required`
- `security.approval.granted`
- `security.approval.denied`
- `security.audit.anomaly_detected`

## 7.5 Capability and registry events

- `capability.snapshot.build.started`
- `capability.snapshot.build.completed`
- `capability.snapshot.changed`
- `capability.registered`
- `capability.unregistered`
- `capability.blocked`
- `action.registry.loaded`
- `action.registry.changed`

## 7.6 Model / reasoning events

### Model selection

- `model.provider.selected`
- `model.provider.changed`
- `model.provider.failover`
- `model.model.selected`
- `model.model.changed`
- `model.permissions.changed`

### Model run lifecycle

- `model.run.created`
- `model.run.started`
- `model.run.stream_opened`
- `model.run.tool_plan_emitted`
- `model.run.completed`
- `model.run.failed`
- `model.run.cancelled`
- `model.run.timeout`

### Prompt and context lifecycle

- `model.context.assembled`
- `model.context.truncated`
- `model.context.injected`
- `model.prompt.system_loaded`
- `model.prompt.runtime_appendix_loaded`
- `model.prompt.user_message_received`
- `model.prompt.safety_overlay_applied`

### Token and cost accounting

- `model.usage.recorded`
- `model.cost.recorded`
- `model.rate_limit.hit`
- `model.retry.scheduled`

## 7.7 Conversation and memory events

### Conversation lifecycle

- `conversation.created`
- `conversation.loaded`
- `conversation.message.added`
- `conversation.message.redacted`
- `conversation.closed`

### Session / run lifecycle

- `session.created`
- `session.started`
- `session.paused`
- `session.resumed`
- `session.closed`
- `run.created`
- `run.started`
- `run.completed`
- `run.failed`
- `run.cancelled`

### Memory and summarization

- `memory.note.created`
- `memory.note.updated`
- `memory.note.deleted`
- `memory.link.created`
- `memory.compaction.started`
- `memory.compaction.completed`
- `summary.generation.started`
- `summary.generation.completed`
- `summary.generation.failed`
- `summary.persisted`

## 7.8 Queue and scheduler events

### Queue lifecycle

- `queue.job.created`
- `queue.job.enqueued`
- `queue.job.claimed`
- `queue.job.started`
- `queue.job.progressed`
- `queue.job.waiting_confirmation`
- `queue.job.retried`
- `queue.job.succeeded`
- `queue.job.failed`
- `queue.job.cancelled`
- `queue.job.dead_lettered`
- `queue.job.priority_changed`
- `queue.backlog.threshold_exceeded`
- `queue.backlog.recovered`

### Scheduler lifecycle

- `scheduler.rule.created`
- `scheduler.rule.updated`
- `scheduler.rule.disabled`
- `scheduler.rule.enabled`
- `scheduler.tick.started`
- `scheduler.tick.completed`
- `scheduler.firing.triggered`
- `scheduler.firing.suppressed`
- `scheduler.firing.failed`

## 7.9 Policy and decision events

### Decision lifecycle

- `policy.decision.created`
- `policy.decision.allowed`
- `policy.decision.blocked`
- `policy.decision.requires_confirmation`
- `policy.decision.expired`

### Risk and rule enforcement

- `policy.limit.hit`
- `policy.slippage.blocked`
- `policy.notional.blocked`
- `policy.wallet_scope.blocked`
- `policy.asset_scope.blocked`
- `policy.network_scope.blocked`
- `policy.cooldown.blocked`
- `policy.idempotency.blocked`

## 7.10 Tool and workspace events

### Tool invocation lifecycle

- `tool.call.created`
- `tool.call.started`
- `tool.call.completed`
- `tool.call.failed`
- `tool.call.timeout`

### Workspace file operations

- `workspace.session.created`
- `workspace.session.closed`
- `workspace.file.read`
- `workspace.file.write`
- `workspace.file.delete`
- `workspace.file.rename`
- `workspace.directory.list`
- `workspace.diff.created`
- `workspace.diff.promoted`
- `workspace.diff.discarded`

### Bash execution

- `workspace.bash.started`
- `workspace.bash.stdout`
- `workspace.bash.stderr`
- `workspace.bash.completed`
- `workspace.bash.failed`
- `workspace.bash.blocked`

## 7.11 Wallet events

- `wallet.created`
- `wallet.imported`
- `wallet.renamed`
- `wallet.archived`
- `wallet.selected`
- `wallet.group.changed`
- `wallet.balance.snapshot_recorded`
- `wallet.holdings.refreshed`
- `wallet.cleanup.requested`
- `wallet.cleanup.completed`
- `wallet.cleanup.failed`

## 7.12 Market data and provider events

### Market data

- `market.token_metadata.requested`
- `market.token_metadata.received`
- `market.quote.requested`
- `market.quote.received`
- `market.quote.expired`
- `market.price_snapshot.recorded`
- `market.candles.refreshed`
- `market.pool_metadata.refreshed`

### External providers / RPC

- `provider.request.started`
- `provider.request.completed`
- `provider.request.failed`
- `provider.rate_limited`
- `provider.timeout`
- `provider.failover.triggered`
- `provider.failover.completed`
- `provider.degraded`
- `provider.recovered`
- `rpc.failover`

## 7.13 Execution events

### Generic execution request lifecycle

- `execution.request.created`
- `execution.request.validated`
- `execution.request.rejected`
- `execution.plan.created`
- `execution.plan.approved`
- `execution.plan.rejected`

### Submission lifecycle

- `execution.attempt.started`
- `execution.attempt.signed`
- `execution.attempt.submitted`
- `execution.attempt.simulation_failed`
- `execution.attempt.confirmed`
- `execution.attempt.settled`
- `execution.attempt.failed`
- `execution.receipt.persisted`

## 7.14 Jupiter / swap-specific events

### Quote + route selection

- `swap.request.created`
- `swap.quote.requested`
- `swap.quote.received`
- `swap.route.selected`
- `swap.route.rejected`
- `swap.profile.selected`

### Submission

- `swap.execution.started`
- `swap.execution.signed`
- `swap.execution.submitted`
- `swap.execution.confirmed`
- `swap.execution.settled`
- `swap.execution.failed`

### Trigger / scheduled swap flows

- `trigger.rule.created`
- `trigger.rule.updated`
- `trigger.rule.cancelled`
- `trigger.order.submitted`
- `trigger.order.activated`
- `trigger.order.triggered`
- `trigger.order.failed`

## 7.15 Transfer and token-account maintenance events

- `transfer.request.created`
- `transfer.execution.started`
- `transfer.execution.submitted`
- `transfer.execution.confirmed`
- `transfer.execution.failed`
- `token_account.cleanup.requested`
- `token_account.cleanup.completed`
- `token_account.cleanup.failed`

## 7.16 Artifact and export events

- `artifact.created`
- `artifact.updated`
- `artifact.linked`
- `artifact.deleted`
- `export.started`
- `export.completed`
- `export.failed`
- `report.generated`

## 7.17 Error and anomaly events

- `error.raised`
- `error.classified`
- `error.escalated`
- `warning.raised`
- `anomaly.detected`
- `panic.prevented`
- `recovery.started`
- `recovery.completed`
- `recovery.failed`

---

# 8. Event routing rules

Each event should declare where it goes.

## 8.1 Route logic

### `db`

Persist to canonical `event_log`.

### `console`

Render to instance live log.

### `session`

Append to session JSONL.

### `summary-input`

Eligible for summary generator.

### `system`

Render to instance or global system log.

### `metrics`

Emit to counters, histograms, gauges, health checks.

### `artifact`

Attach to generated artifacts or workspace audit trail.

## 8.2 Default routing by category

### Always to DB

Almost all meaningful events should route to `db`.

### Usually to console

- runtime lifecycle
- queue lifecycle
- action lifecycle
- execution lifecycle
- provider issues
- warnings/errors

### Usually to session

- conversation events
- model run events
- tool calls
- approval events
- execution requests tied to user/session

### Usually to summary-input

- session lifecycle
- model runs
- decisions
- tool calls
- execution outcomes
- summary generation

### Usually to system

- settings changes
- model/provider changes
- capability changes
- schema drift/migration
- policy mode changes
- security boundary violations
- queue pressure
- degraded/recovered state transitions

---

# 9. Exact routing matrix for the three log products

| Event family | Console log | Session log | System log |
|---|---:|---:|---:|
| `runtime.boot.*` | yes | no | yes |
| `runtime.shutdown.*` | yes | no | yes |
| `runtime.health.*` | yes | no | yes |
| `instance.*` | yes | no | yes |
| `runtime.settings.*` | maybe | no | yes |
| `runtime.schema.*` | yes | no | yes |
| `security.*` | yes | maybe | yes |
| `capability.*` | maybe | no | yes |
| `model.provider.*` | yes | maybe | yes |
| `model.model.*` | yes | maybe | yes |
| `model.run.*` | maybe | yes | maybe |
| `conversation.*` | no | yes | no |
| `session.*` | maybe | yes | maybe |
| `run.*` | maybe | yes | maybe |
| `memory.*` | no | maybe | yes |
| `summary.*` | no | maybe | yes |
| `queue.job.*` | yes | maybe | maybe |
| `scheduler.*` | yes | no | yes |
| `policy.*` | yes | yes | yes |
| `tool.call.*` | maybe | yes | maybe |
| `workspace.*` | maybe | yes | maybe |
| `wallet.*` | yes | maybe | maybe |
| `market.*` | maybe | maybe | no |
| `provider.*` | yes | no | yes |
| `execution.*` | yes | yes | maybe |
| `swap.*` | yes | yes | maybe |
| `trigger.*` | yes | yes | maybe |
| `transfer.*` | yes | yes | maybe |
| `artifact.*` | no | maybe | maybe |
| `error.*` / `warning.*` / `anomaly.*` | yes | maybe | yes |

### Reading note

- **Console log** = tactical flow for operators
- **Session log** = user/run reconstruction
- **System log** = machine governance and top-down state changes

---

# 10. Summary generation contract

## 10.1 What summaries should read from

Summaries should be generated from:

- session JSONL
- summary-eligible event stream
- linked artifacts if needed

## 10.2 What summaries should not replace

Summaries must **never** replace:

- raw transcript
- canonical `event_log`
- current-state tables

## 10.3 Good summary sections

- session metadata
- objective
- key model/tool decisions
- important approvals/blocks
- executions attempted
- outcomes
- warnings/errors
- artifacts produced
- next-step reminders

---

# 11. Recommended event_log table shape

```sql
CREATE TABLE event_log (
  event_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  event_version INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  session_id TEXT,
  run_id TEXT,
  job_id TEXT,
  action_id TEXT,
  execution_id TEXT,
  decision_id TEXT,
  conversation_id TEXT,
  wallet_id TEXT,
  provider TEXT,
  model TEXT,
  severity TEXT NOT NULL,
  scope TEXT NOT NULL,
  route_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  tags_json TEXT,
  causal_parent_event_id TEXT,
  idempotency_key TEXT,
  render_hint TEXT
);

CREATE INDEX idx_event_log_occurred_at ON event_log (occurred_at);
CREATE INDEX idx_event_log_event_name ON event_log (event_name);
CREATE INDEX idx_event_log_instance_time ON event_log (instance_id, occurred_at);
CREATE INDEX idx_event_log_session_time ON event_log (session_id, occurred_at);
CREATE INDEX idx_event_log_run_time ON event_log (run_id, occurred_at);
CREATE INDEX idx_event_log_job_time ON event_log (job_id, occurred_at);
CREATE INDEX idx_event_log_execution_time ON event_log (execution_id, occurred_at);
CREATE INDEX idx_event_log_decision_time ON event_log (decision_id, occurred_at);
CREATE INDEX idx_event_log_severity_time ON event_log (severity, occurred_at);
```

## Important rule

Use normal columns for fields you will filter, sort, correlate, or index.

Only keep flexible payload edges in JSON.

---

# 12. Caches and projections

Every cache or projection should declare:

- source
- refresh policy
- rebuildability
- staleness policy
- cache version

Recommended metadata columns:

- `source_kind`
- `source_key`
- `fetched_at`
- `expires_at`
- `stale_after`
- `cache_version`

This prevents caches from being mistaken for truth.

---

# 13. Exact role for AgentFS

## Use AgentFS for

- sandboxed per-run workspaces
- generated files
- code edits in isolated runs
- CSV exports
- charts, screenshots, reports
- bash scratch work
- audit trails for workspace file activity

## Do not use AgentFS as the primary authority for

- position ledger
- live queue ownership
- execution authority
- irreversible money-moving truth
- signing-key custody

## Best pattern

- `runtime.db` = canonical runtime truth
- `workspaces/<run-id>.agentfs.sqlite` = per-run isolated workspace
- promotion step required before moving workspace outputs into canonical storage or repo state

---

# 14. Migration plan

## Phase 1

- merge `runtime.sqlite` and `queue.sqlite` into `runtime.db`
- define table families
- create normalized `event_log`
- keep existing external logs, but render them from the event backbone

## Phase 2

- formalize session transcript format
- formalize summary generation inputs
- formalize system log routing
- add correlation IDs everywhere

## Phase 3

- add AgentFS workspaces for runs/tasks
- add workspace promotion flow
- add diff review flow for file changes

## Phase 4

- move from boot-time auto-mutation to explicit migrations for non-dev instances
- add `STORAGE.md` and `EVENTS.md` as human contracts

---

# 15. Final answer in one sentence

The correct redesign is **not** to collapse your logs into one thing.

It is to keep:

- **regular console logs**
- **session transcript + summaries**
- **system-level highest-vantage logs**

while making them all feed from one **structured event backbone** and one **authoritative runtime database**, with **AgentFS reserved for sandboxed workspace state rather than core trading truth**.
