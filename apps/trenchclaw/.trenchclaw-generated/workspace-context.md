# Workspace Context Snapshot

Generated at: 2026-03-20T00:31:04.785Z
Root: apps/trenchclaw/

This file is generated. Refresh with:
`bun run context:refresh`

## Workspace Scope
This file intentionally omits the full directory tree to avoid prompt bloat.

Use `.trenchclaw-generated/knowledge-index.md` for documentation inventory and workspace tools for exact path discovery.

Important paths:
- `apps/trenchclaw/src/ai/config/`
- `apps/trenchclaw/src/ai/llm/`
- `apps/trenchclaw/src/runtime/`
- `apps/trenchclaw/src/solana/`
- `.trenchclaw-generated/knowledge-index.md`
- `.runtime-state/instances/<id>/settings/ai.json`
- `.runtime-state/instances/<id>/settings/settings.json`
- `.runtime-state/instances/<id>/data/runtime.db`

Omitted generated/vendor directories if a tree is requested elsewhere: node_modules, .vite, .next, .turbo, .svelte-kit, dist, build, coverage

## GUI API Route Catalog (Generated)
| routePath |
| --- |
| /api/gui/activity |
| /api/gui/ai-settings |
| /api/gui/bootstrap |
| /api/gui/client-error |
| /api/gui/conversations |
| /api/gui/events |
| /api/gui/instances |
| /api/gui/instances/sign-in |
| /api/gui/llm/check |
| /api/gui/queue |
| /api/gui/schedule |
| /api/gui/secrets |
| /api/gui/sol-price |
| /api/gui/trading-settings |
| /api/gui/vault |
| /api/gui/wallets |
| /api/gui/wallets/download |
| /v1/chat/stream |
| /v1/health |
| /v1/runtime |

## SQLite Schema Snapshot
```text
SQLite schema snapshot (11 tables)
- schema_migrations: version:INTEGER[pk], applied_at:INTEGER[not_null]
- jobs: id:TEXT[pk], serial_number:INTEGER, bot_id:TEXT[not_null], routine_name:TEXT[not_null], status:TEXT[not_null], config_json:TEXT[not_null], next_run_at:INTEGER, last_run_at:INTEGER, cycles_completed:INTEGER[not_null], total_cycles:INTEGER, last_result_json:TEXT, attempt_count:INTEGER, lease_owner:TEXT, lease_expires_at:INTEGER, last_error:TEXT, created_at:INTEGER[not_null], updated_at:INTEGER[not_null]
- action_receipts: idempotency_key:TEXT[pk], payload_json:TEXT[not_null], timestamp:INTEGER[not_null]
- conversations: id:TEXT[pk], session_id:TEXT, title:TEXT, summary:TEXT, created_at:INTEGER[not_null], updated_at:INTEGER[not_null]
- chat_messages: id:TEXT[pk], conversation_id:TEXT[not_null,fk->conversations.id], role:TEXT[not_null], content:TEXT[not_null], metadata_json:TEXT, created_at:INTEGER[not_null]
- instance_profiles: instance_id:TEXT[pk], display_name:TEXT, summary:TEXT, trading_style:TEXT, risk_tolerance:TEXT, preferred_assets_json:TEXT, disliked_assets_json:TEXT, metadata_json:TEXT, created_at:INTEGER[not_null], updated_at:INTEGER[not_null]
- instance_facts: id:TEXT[pk], instance_id:TEXT[not_null], fact_key:TEXT[not_null], fact_value_json:TEXT[not_null], confidence:REAL[not_null], source:TEXT[not_null], source_message_id:TEXT, created_at:INTEGER[not_null], updated_at:INTEGER[not_null], expires_at:INTEGER
- market_instruments: id:INTEGER[pk], chain:TEXT[not_null], address:TEXT[not_null], symbol:TEXT, name:TEXT, decimals:INTEGER, created_at:INTEGER[not_null], updated_at:INTEGER[not_null]
- ohlcv_bars: instrument_id:INTEGER[not_null,fk->market_instruments.id], source:TEXT[not_null], interval:TEXT[not_null], open_time:INTEGER[not_null], close_time:INTEGER[not_null], open:REAL[not_null], high:REAL[not_null], low:REAL[not_null], close:REAL[not_null], volume:REAL, trades:INTEGER, vwap:REAL, fetched_at:INTEGER[not_null], raw_json:TEXT
- market_snapshots: id:TEXT[pk], instrument_id:INTEGER[not_null,fk->market_instruments.id], source:TEXT[not_null], snapshot_type:TEXT[not_null], data_json:TEXT[not_null], timestamp:INTEGER[not_null]
- http_cache: cache_key:TEXT[pk], source:TEXT[not_null], endpoint:TEXT[not_null], request_hash:TEXT[not_null], response_json:TEXT[not_null], status_code:INTEGER[not_null], etag:TEXT, last_modified:TEXT, fetched_at:INTEGER[not_null], expires_at:INTEGER
```

## SQLite SQL Schema Snapshot (Canonical)
```sql
CREATE TABLE "action_receipts" (
  "idempotency_key" TEXT PRIMARY KEY,
  "payload_json" TEXT NOT NULL,
  "timestamp" INTEGER NOT NULL
);

CREATE TABLE "chat_messages" (
  "id" TEXT PRIMARY KEY,
  "conversation_id" TEXT NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  "content" TEXT NOT NULL,
  "metadata_json" TEXT,
  "created_at" INTEGER NOT NULL
);

CREATE TABLE "conversations" (
  "id" TEXT PRIMARY KEY,
  "session_id" TEXT,
  "title" TEXT,
  "summary" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

CREATE TABLE "http_cache" (
  "cache_key" TEXT PRIMARY KEY,
  "source" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "response_json" TEXT NOT NULL,
  "status_code" INTEGER NOT NULL,
  "etag" TEXT,
  "last_modified" TEXT,
  "fetched_at" INTEGER NOT NULL,
  "expires_at" INTEGER
);

CREATE TABLE "instance_facts" (
  "id" TEXT PRIMARY KEY,
  "instance_id" TEXT NOT NULL,
  "fact_key" TEXT NOT NULL,
  "fact_value_json" TEXT NOT NULL,
  "confidence" REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  "source" TEXT NOT NULL,
  "source_message_id" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "expires_at" INTEGER CHECK (expires_at IS NULL OR expires_at >= 0),
  UNIQUE(instance_id, fact_key)
);

CREATE TABLE "instance_profiles" (
  "instance_id" TEXT PRIMARY KEY,
  "display_name" TEXT,
  "summary" TEXT,
  "trading_style" TEXT,
  "risk_tolerance" TEXT,
  "preferred_assets_json" TEXT,
  "disliked_assets_json" TEXT,
  "metadata_json" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

CREATE TABLE "jobs" (
  "id" TEXT PRIMARY KEY,
  "serial_number" INTEGER CHECK (serial_number IS NULL OR serial_number > 0),
  "bot_id" TEXT NOT NULL,
  "routine_name" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'stopped', 'failed')),
  "config_json" TEXT NOT NULL,
  "next_run_at" INTEGER,
  "last_run_at" INTEGER,
  "cycles_completed" INTEGER NOT NULL CHECK (cycles_completed >= 0),
  "total_cycles" INTEGER CHECK (total_cycles IS NULL OR total_cycles >= 0),
  "last_result_json" TEXT,
  "attempt_count" INTEGER CHECK (attempt_count IS NULL OR attempt_count >= 0),
  "lease_owner" TEXT,
  "lease_expires_at" INTEGER CHECK (lease_expires_at IS NULL OR lease_expires_at >= 0),
  "last_error" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

CREATE TABLE "market_instruments" (
  "id" INTEGER PRIMARY KEY,
  "chain" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "symbol" TEXT,
  "name" TEXT,
  "decimals" INTEGER CHECK (decimals IS NULL OR decimals >= 0),
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  UNIQUE(chain, address)
);

CREATE TABLE "market_snapshots" (
  "id" TEXT PRIMARY KEY,
  "instrument_id" INTEGER NOT NULL REFERENCES "market_instruments"("id") ON DELETE CASCADE,
  "source" TEXT NOT NULL,
  "snapshot_type" TEXT NOT NULL,
  "data_json" TEXT NOT NULL,
  "timestamp" INTEGER NOT NULL
);

CREATE TABLE "ohlcv_bars" (
  "instrument_id" INTEGER NOT NULL REFERENCES "market_instruments"("id") ON DELETE CASCADE,
  "source" TEXT NOT NULL,
  "interval" TEXT NOT NULL,
  "open_time" INTEGER NOT NULL,
  "close_time" INTEGER NOT NULL,
  "open" REAL NOT NULL,
  "high" REAL NOT NULL,
  "low" REAL NOT NULL,
  "close" REAL NOT NULL,
  "volume" REAL,
  "trades" INTEGER,
  "vwap" REAL,
  "fetched_at" INTEGER NOT NULL,
  "raw_json" TEXT,
  PRIMARY KEY(instrument_id, source, interval, open_time)
);

CREATE TABLE "schema_migrations" (
  "version" INTEGER PRIMARY KEY,
  "applied_at" INTEGER NOT NULL
);

CREATE INDEX "idx_action_receipts_timestamp" ON "action_receipts"("timestamp");

CREATE INDEX "idx_chat_messages_conversation_created_at" ON "chat_messages"("conversation_id", "created_at");

CREATE INDEX "idx_conversations_updated_at" ON "conversations"("updated_at");

CREATE INDEX "idx_http_cache_expires_at" ON "http_cache"("expires_at");

CREATE INDEX "idx_http_cache_source_endpoint" ON "http_cache"("source", "endpoint");

CREATE INDEX "idx_instance_facts_expires_at" ON "instance_facts"("expires_at");

CREATE INDEX "idx_instance_facts_instance_updated" ON "instance_facts"("instance_id", "updated_at");

CREATE INDEX "idx_instance_profiles_updated_at" ON "instance_profiles"("updated_at");

CREATE INDEX "idx_jobs_bot_id_status" ON "jobs"("bot_id", "status");

CREATE INDEX "idx_jobs_lease_expires_at" ON "jobs"("status", "lease_expires_at");

CREATE UNIQUE INDEX "idx_jobs_serial_number" ON "jobs"("serial_number");

CREATE INDEX "idx_jobs_status_next_run_at" ON "jobs"("status", "next_run_at");

CREATE INDEX "idx_market_instruments_chain_symbol" ON "market_instruments"("chain", "symbol");

CREATE INDEX "idx_market_snapshots_lookup" ON "market_snapshots"("instrument_id", "source", "snapshot_type", "timestamp");

CREATE INDEX "idx_ohlcv_fetched_at" ON "ohlcv_bars"("fetched_at");

CREATE INDEX "idx_ohlcv_lookup" ON "ohlcv_bars"("instrument_id", "source", "interval", "open_time");
```

## SQLite SQL Schema Snapshot (Live DB)
No live SQLite database found.

Set `TRENCHCLAW_CONTEXT_DB_PATH` to a DB path or create one at:

