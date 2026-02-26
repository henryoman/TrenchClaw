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

CREATE TABLE "jobs" (
  "id" TEXT PRIMARY KEY,
  "bot_id" TEXT NOT NULL,
  "routine_name" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'stopped', 'failed')),
  "config_json" TEXT NOT NULL,
  "next_run_at" INTEGER,
  "last_run_at" INTEGER,
  "cycles_completed" INTEGER NOT NULL CHECK (cycles_completed >= 0),
  "total_cycles" INTEGER CHECK (total_cycles IS NULL OR total_cycles >= 0),
  "last_result_json" TEXT,
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

CREATE INDEX "idx_jobs_bot_id_status" ON "jobs"("bot_id", "status");

CREATE INDEX "idx_jobs_status_next_run_at" ON "jobs"("status", "next_run_at");

CREATE INDEX "idx_market_instruments_chain_symbol" ON "market_instruments"("chain", "symbol");

CREATE INDEX "idx_market_snapshots_lookup" ON "market_snapshots"("instrument_id", "source", "snapshot_type", "timestamp");

CREATE INDEX "idx_ohlcv_fetched_at" ON "ohlcv_bars"("fetched_at");

CREATE INDEX "idx_ohlcv_lookup" ON "ohlcv_bars"("instrument_id", "source", "interval", "open_time");