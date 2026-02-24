# Runtime Storage Map

This folder owns runtime persistence and runtime file writes.

Full schema reference: `docs/storage-schema.md`.
Live SQLite Zod schema module: `src/runtime/storage/sqlite-schema.ts`.
Runtime payload Zod schema module: `src/runtime/storage/schema.ts`.
SQLite schema sync + ORM mapping: `src/runtime/storage/sqlite-orm.ts`.

## SQLite (Bun) Database

Primary database: `storage.sqlite.path` (from runtime settings).

### Core runtime tables

- `jobs`
: Scheduler state for bot jobs.
  - Key: `id`
  - Indexed: `(status, next_run_at)`, `(bot_id, status)`

- `action_receipts`
: Idempotency receipts and action outcomes.
  - Key: `idempotency_key`
  - Indexed: `timestamp DESC`

- `policy_hits`
: Policy gate results.
  - Key: `id`
  - Indexed: `created_at DESC`, `(action_name, created_at DESC)`

- `decision_logs`
: Planner/dispatcher decision traces.
  - Key: `id`
  - FK: `job_id -> jobs(id)`
  - Indexed: `created_at DESC`, `(job_id, created_at DESC)`

- `conversations`
: Conversation containers for chat history.
  - Key: `id`
  - Indexed: `updated_at DESC`

- `chat_messages`
: Individual chat entries attached to a conversation.
  - Key: `id`
  - FK: `conversation_id -> conversations(id)`
  - Indexed: `(conversation_id, created_at DESC)`

### Market/chart data tables

- `market_instruments`
: Canonical instrument identity (`chain + address`) with metadata.
  - Key: `id`
  - Unique: `(chain, address)`

- `ohlcv_bars`
: Time-series candles downloaded from providers.
  - Composite key: `(instrument_id, source, interval, open_time)`
  - FK: `instrument_id -> market_instruments(id)`
  - Stores: OHLCV + trades/vwap + raw payload JSON
  - Indexed for range queries by instrument/source/interval/time

- `market_snapshots`
: Non-candle point-in-time payloads (quote books, price snapshots, indicators).
  - Key: `id`
  - FK: `instrument_id -> market_instruments(id)`
  - Indexed by `(instrument_id, source, snapshot_type, timestamp DESC)`

- `http_cache`
: Provider response cache with TTL.
  - Key: `cache_key`
  - Stores: request hash, response payload, status, etag/last-modified, fetched/expires timestamps

### Schema management

- `schema_migrations`
: Applied schema versions and timestamps.
- Boot-time schema sync
: On runtime boot, TrenchClaw auto-syncs SQLite schema from `sqlite-orm.ts`:
  - creates missing tables
  - adds missing columns
  - creates missing indexes
  - logs a compact schema snapshot for model/operator context

## Runtime file stores

- `file-event-log.ts`
: Writes one JSON event file per event into `storage.files.eventsDirectory`.

- `session-log-store.ts`
: Session index (`sessions.json`) and per-session JSONL transcript files.

- `session-summary-store.ts`
: Writes compact markdown summaries (`summaries/<sessionId>.md`) at runtime stop.

- `system-log-store.ts`
: Appends runtime/system logger entries into daily log files (`system/<YYYY-MM-DD>.log`).

- `memory-log-store.ts`
: Daily and long-term markdown memory logs.

## Data placement rules

- Job/execution state: `jobs`, `action_receipts`, `policy_hits`, `decision_logs`
- Conversation history: `conversations`, `chat_messages`
- Downloaded chart candles: `ohlcv_bars`
- Latest computed market state: `market_snapshots`
- Raw API cacheable responses: `http_cache`
- Human-readable operator history: session/memory file stores

## Retention

On runtime boot (SQLite mode), old records are pruned using configured retention:

- `storage.retention.receiptsDays`
- `storage.retention.policyHitsDays`
- `storage.retention.decisionLogsDays`

Expired `http_cache` rows are also pruned at boot.
