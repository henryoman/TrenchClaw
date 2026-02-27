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
  - Indexed: `(status, next_run_at)`, `(bot_id, status)`, `(status, lease_expires_at)`
  - Queue metadata columns: `attempt_count`, `lease_owner`, `lease_expires_at`, `last_error`
  - Restart behavior: jobs left in `running` are recovered to `pending` on boot

- `action_receipts`
: Idempotency receipts and action outcomes.
  - Key: `idempotency_key`
  - Indexed: `timestamp DESC`

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

- `summary-log-store.ts`
: Writes concise top-level runtime summaries into daily files (`summary/<YYYY-MM-DD>.log`), focused on runtime lifecycle, completed data downloads, and executed trades.

- `file-event-log.ts`
: Writes one JSON event file per event into `storage.files.eventsDirectory`.

- `session-log-store.ts`
: Session index (`sessions.json`) and per-session JSONL transcript files. This is the detailed event stream used for model/operator replay, including queue enqueue/dequeue/complete lifecycle events.

- `session-summary-store.ts`
: Writes compact markdown summaries (`summaries/<sessionId>.md`) at runtime stop.

- `system-log-store.ts`
: Appends runtime/system logger entries into daily log files (`system/<YYYY-MM-DD>.log`), including AI call telemetry (duration + token usage when available).

- `memory-log-store.ts`
: Daily and long-term markdown memory logs.

## Data placement rules

- Job/execution state: `jobs`, `action_receipts`
- Conversation history: `conversations`, `chat_messages`
- Downloaded chart candles: `ohlcv_bars`
- Latest computed market state: `market_snapshots`
- Raw API cacheable responses: `http_cache`
- Human-readable operator history: session/memory file stores

## Model query surface

The model-facing read API for runtime state is `queryRuntimeStore`:

- Central request/response schema: `src/solana/actions/data-fetch/runtime/queryRuntimeStore.ts`
- Search endpoint: `searchRuntimeText` (conversations/messages/jobs/receipts)
- Context endpoint: `getRuntimeKnowledgeSurface` (schema snapshot, counts, recent runtime history)

## Retention

On runtime boot (SQLite mode), old records are pruned using configured retention:

- `storage.retention.receiptsDays`

Expired `http_cache` rows are also pruned at boot.
