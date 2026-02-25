# Workspace Context Snapshot

Generated at: 2026-02-25T04:41:02.127Z
Root: apps/trenchclaw/

This file is generated. Refresh with:
`bun run context:refresh`

## Workspace Map (apps/trenchclaw/)
```text
# WORKSPACE ROOT: apps/trenchclaw/
apps/trenchclaw/
|-- src/
|   |-- ai/
|   |   |-- brain/
|   |   |   |-- db/
|   |   |   |   |-- events/
|   |   |   |   |   |-- .keep
|   |   |   |   |   |-- 1771994462014-policy_block-74612c50-150f-40c2-b586-3768594ed4cc.json
|   |   |   |   |   |-- 1771994462018-action_start-7ac4b526-0150-4d58-b211-6d036598a0e6.json
|   |   |   |   |   `-- 1771994462019-action_success-22aa5e0a-8f44-4a1c-bfb5-55eabc08b055.json
|   |   |   |   |-- memory/
|   |   |   |   |   |-- 2026-02-25.md
|   |   |   |   |   `-- MEMORY.md
|   |   |   |   |-- sessions/
|   |   |   |   |   |-- .keep
|   |   |   |   |   |-- 5831ae72-0ee8-4313-ab7f-83c51197c71e.jsonl
|   |   |   |   |   `-- sessions.json
|   |   |   |   |-- summaries/
|   |   |   |   |   |-- .keep
|   |   |   |   |   `-- 5831ae72-0ee8-4313-ab7f-83c51197c71e.md
|   |   |   |   |-- summary/
|   |   |   |   |   |-- .keep
|   |   |   |   |   `-- 2026-02-25.log
|   |   |   |   |-- system/
|   |   |   |   |   |-- .keep
|   |   |   |   |   `-- 2026-02-25.log
|   |   |   |   |-- .gitignore
|   |   |   |   |-- README.md
|   |   |   |   |-- runtime.sqlite
|   |   |   |   |-- runtime.sqlite-shm
|   |   |   |   `-- runtime.sqlite-wal
|   |   |   |-- knowledge/
|   |   |   |   |-- dexscreener/
|   |   |   |   |   |-- dexscreener-actions.md
|   |   |   |   |   `-- dexscreener-api-reference.md
|   |   |   |   |-- skills/
|   |   |   |   |-- data-structures-as-json.md
|   |   |   |   |-- helius.md
|   |   |   |   |-- KNOWLEDGE_MANIFEST.md
|   |   |   |   `-- knowledge-tree.ts
|   |   |   |-- protected/
|   |   |   |   |-- context/
|   |   |   |   |   `-- workspace-and-schema.md
|   |   |   |   |-- default-modes/
|   |   |   |   |   `-- operator.md
|   |   |   |   |-- instance/
|   |   |   |   |   `-- .gitkeep
|   |   |   |   |-- no-read/
|   |   |   |   |   |-- ai.json
|   |   |   |   |   `-- vault.json
|   |   |   |   `-- system/
|   |   |   |       |-- modes/
|   |   |   |       |   `-- operator.md
|   |   |   |       |-- safety-modes/
|   |   |   |       |   |-- dangerous.yaml
|   |   |   |       |   |-- safe.yaml
|   |   |   |       |   `-- veryDangerous.yaml
|   |   |   |       |-- payload-manifest.yaml
|   |   |   |       `-- system.md
|   |   |   |-- user-settings/
|   |   |   |   |-- custom-modes/
|   |   |   |   |-- notifications.yaml
|   |   |   |   |-- settings.yaml
|   |   |   |   `-- swap.yaml
|   |   |   |-- workspace/
|   |   |   |   |-- misc-scripts/
|   |   |   |   |-- notes/
|   |   |   |   |-- ui/
|   |   |   |   `-- rules.md
|   |   |   |-- rules.md
|   |   |   `-- soul.md
|   |   |-- core/
|   |   |   |-- action-registry.ts
|   |   |   |-- dispatcher.ts
|   |   |   |-- event-bus.ts
|   |   |   |-- index.ts
|   |   |   |-- policy-engine.ts
|   |   |   |-- scheduler.ts
|   |   |   `-- state-store.ts
|   |   |-- llm/
|   |   |   |-- client.ts
|   |   |   |-- config.ts
|   |   |   |-- index.ts
|   |   |   |-- prompt-loader.ts
|   |   |   |-- prompt-manifest.ts
|   |   |   |-- shared.ts
|   |   |   |-- types.ts
|   |   |   |-- user-settings-loader.ts
|   |   |   `-- workspace-map.ts
|   |   |-- runtime/
|   |   |   |-- types/
|   |   |   |   |-- action.ts
|   |   |   |   |-- context.ts
|   |   |   |   |-- events.ts
|   |   |   |   |-- index.ts
|   |   |   |   |-- policy.ts
|   |   |   |   |-- scheduler.ts
|   |   |   |   `-- state.ts
|   |   |   `-- index.ts
|   |   |-- index.ts
|   |   `-- README.md
|   |-- lib/
|   |   |-- agent-scripts/
|   |   |   |-- clean-runtime-artifacts.ts
|   |   |   |-- refresh-knowledge-manifest.ts
|   |   |   `-- refresh-workspace-context.ts
|   |   `-- commands.txt
|   |-- runtime/
|   |   |-- load/
|   |   |   |-- authority.ts
|   |   |   |-- index.ts
|   |   |   |-- loader.ts
|   |   |   `-- schema.ts
|   |   |-- logging/
|   |   |   |-- index.ts
|   |   |   `-- runtime-logger.ts
|   |   |-- storage/
|   |   |   |-- file-event-log.ts
|   |   |   |-- index.ts
|   |   |   |-- memory-log-store.ts
|   |   |   |-- README.md
|   |   |   |-- schema.ts
|   |   |   |-- session-log-store.ts
|   |   |   |-- session-summary-store.ts
|   |   |   |-- sqlite-orm.ts
|   |   |   |-- sqlite-schema.ts
|   |   |   |-- sqlite-state-store.ts
|   |   |   |-- summary-log-store.ts
|   |   |   `-- system-log-store.ts
|   |   |-- bootstrap.ts
|   |   `-- index.ts
|   |-- solana/
|   |   |-- actions/
|   |   |   |-- data-fetch/
|   |   |   |   |-- alerts/
|   |   |   |   |   |-- createBlockchainAlert.ts
|   |   |   |   |   `-- index.ts
|   |   |   |   |-- api/
|   |   |   |   |   `-- dexscreener.ts
|   |   |   |   |-- rpc/
|   |   |   |   |   |-- getAccountInfo.ts
|   |   |   |   |   |-- getBalance.ts
|   |   |   |   |   |-- getMarketData.ts
|   |   |   |   |   |-- getMultipleAccounts.ts
|   |   |   |   |   |-- getTokenMetadata.ts
|   |   |   |   |   |-- getTokenPrice.ts
|   |   |   |   |   `-- shared.ts
|   |   |   |   |-- runtime/
|   |   |   |   |   |-- index.ts
|   |   |   |   |   `-- queryRuntimeStore.ts
|   |   |   |   `-- index.ts
|   |   |   |-- wallet-based/
|   |   |   |   |-- create-wallets/
|   |   |   |   |   |-- create-vanity-wallet.sh
|   |   |   |   |   |-- createWallets.ts
|   |   |   |   |   |-- index.ts
|   |   |   |   |   `-- renameWallets.ts
|   |   |   |   |-- read-only/
|   |   |   |   |   |-- checkBalance.ts
|   |   |   |   |   |-- checkSolBalance.ts
|   |   |   |   |   |-- getWalletState.ts
|   |   |   |   |   `-- index.ts
|   |   |   |   |-- swap/
|   |   |   |   |   |-- rpc/
|   |   |   |   |   |   |-- executeSwap.ts
|   |   |   |   |   |   |-- index.ts
|   |   |   |   |   |   `-- quoteSwap.ts
|   |   |   |   |   |-- ultra/
|   |   |   |   |   |   |-- confirmationTracker.ts
|   |   |   |   |   |   |-- executeSwap.ts
|   |   |   |   |   |   |-- index.ts
|   |   |   |   |   |   |-- quoteSwap.ts
|   |   |   |   |   |   |-- shared.ts
|   |   |   |   |   |   `-- swap.ts
|   |   |   |   |   `-- index.ts
|   |   |   |   |-- token/
|   |   |   |   |   |-- launch/
|   |   |   |   |   |   `-- meteora/
|   |   |   |   |   `-- mint/
|   |   |   |   |       `-- createToken.ts
|   |   |   |   |-- transfer/
|   |   |   |   |   |-- index.ts
|   |   |   |   |   |-- privacyCash.ts
|   |   |   |   |   `-- transfer.ts
|   |   |   |   `-- index.ts
|   |   |   `-- index.ts
|   |   |-- lib/
|   |   |   |-- adapters/
|   |   |   |   |-- index.ts
|   |   |   |   |-- jupiter-ultra.ts
|   |   |   |   |-- jupiter.ts
|   |   |   |   |-- rpc-pool.ts
|   |   |   |   |-- token-account.ts
|   |   |   |   `-- ultra-signer.ts
|   |   |   |-- ultra/
|   |   |   |   `-- parsing.ts
|   |   |   `-- wallet/
|   |   |       |-- encryption.ts
|   |   |       |-- hd-derivation.ts
|   |   |       |-- index.ts
|   |   |       |-- protected-write-policy.ts
|   |   |       |-- wallet-manager.ts
|   |   |       |-- wallet-policy.ts
|   |   |       |-- wallet-signer.ts
|   |   |       |-- wallet-store.ts
|   |   |       `-- wallet-types.ts
|   |   |-- routines/
|   |   |   |-- action-sequence.ts
|   |   |   |-- create-wallets.ts
|   |   |   |-- dca.ts
|   |   |   |-- index.ts
|   |   |   `-- routines.json
|   |   |-- triggers/
|   |   |   |-- index.ts
|   |   |   |-- on-chain.ts
|   |   |   |-- price.ts
|   |   |   `-- timer.ts
|   |   `-- index.ts
|   `-- index.ts
|-- types/
|   `-- index.ts
|-- .env.example
|-- .gitignore
|-- package.json
|-- README.md
`-- tsconfig.json
```

Omitted generated/vendor directories: node_modules, .vite, .next, .turbo, .svelte-kit, dist, build, coverage

## SQLite Schema Snapshot
```text
SQLite schema snapshot (11 tables)
- schema_migrations: version:INTEGER[pk], applied_at:INTEGER[not_null]
- jobs: id:TEXT[pk], bot_id:TEXT[not_null], routine_name:TEXT[not_null], status:TEXT[not_null], config_json:TEXT[not_null], next_run_at:INTEGER, last_run_at:INTEGER, cycles_completed:INTEGER[not_null], total_cycles:INTEGER, last_result_json:TEXT, created_at:INTEGER[not_null], updated_at:INTEGER[not_null]
- action_receipts: idempotency_key:TEXT[pk], payload_json:TEXT[not_null], timestamp:INTEGER[not_null]
- policy_hits: id:TEXT[pk], action_name:TEXT[not_null], result_json:TEXT[not_null], created_at:INTEGER[not_null]
- decision_logs: id:TEXT[pk], job_id:TEXT[fk->jobs.id], action_name:TEXT[not_null], trace_json:TEXT[not_null], created_at:INTEGER[not_null]
- conversations: id:TEXT[pk], session_id:TEXT, title:TEXT, summary:TEXT, created_at:INTEGER[not_null], updated_at:INTEGER[not_null]
- chat_messages: id:TEXT[pk], conversation_id:TEXT[not_null,fk->conversations.id], role:TEXT[not_null], content:TEXT[not_null], metadata_json:TEXT, created_at:INTEGER[not_null]
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

CREATE TABLE "decision_logs" (
  "id" TEXT PRIMARY KEY,
  "job_id" TEXT REFERENCES "jobs"("id") ON DELETE SET NULL,
  "action_name" TEXT NOT NULL,
  "trace_json" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL
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

CREATE TABLE "policy_hits" (
  "id" TEXT PRIMARY KEY,
  "action_name" TEXT NOT NULL,
  "result_json" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL
);

CREATE TABLE "schema_migrations" (
  "version" INTEGER PRIMARY KEY,
  "applied_at" INTEGER NOT NULL
);

CREATE INDEX "idx_action_receipts_timestamp" ON "action_receipts"("timestamp");

CREATE INDEX "idx_chat_messages_conversation_created_at" ON "chat_messages"("conversation_id", "created_at");

CREATE INDEX "idx_conversations_updated_at" ON "conversations"("updated_at");

CREATE INDEX "idx_decision_logs_created_at" ON "decision_logs"("created_at");

CREATE INDEX "idx_decision_logs_job_id_created_at" ON "decision_logs"("job_id", "created_at");

CREATE INDEX "idx_http_cache_expires_at" ON "http_cache"("expires_at");

CREATE INDEX "idx_http_cache_source_endpoint" ON "http_cache"("source", "endpoint");

CREATE INDEX "idx_jobs_bot_id_status" ON "jobs"("bot_id", "status");

CREATE INDEX "idx_jobs_status_next_run_at" ON "jobs"("status", "next_run_at");

CREATE INDEX "idx_market_instruments_chain_symbol" ON "market_instruments"("chain", "symbol");

CREATE INDEX "idx_market_snapshots_lookup" ON "market_snapshots"("instrument_id", "source", "snapshot_type", "timestamp");

CREATE INDEX "idx_ohlcv_fetched_at" ON "ohlcv_bars"("fetched_at");

CREATE INDEX "idx_ohlcv_lookup" ON "ohlcv_bars"("instrument_id", "source", "interval", "open_time");

CREATE INDEX "idx_policy_hits_action_name_created_at" ON "policy_hits"("action_name", "created_at");

CREATE INDEX "idx_policy_hits_created_at" ON "policy_hits"("created_at");
```

## SQLite SQL Schema Snapshot (Live DB)
Source DB: `/Volumes/T9/cursor/TrenchClaw/apps/trenchclaw/src/ai/brain/db/runtime.sqlite`
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

CREATE TABLE "decision_logs" (
  "id" TEXT PRIMARY KEY,
  "job_id" TEXT REFERENCES "jobs"("id") ON DELETE SET NULL,
  "action_name" TEXT NOT NULL,
  "trace_json" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL
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

CREATE TABLE "policy_hits" (
  "id" TEXT PRIMARY KEY,
  "action_name" TEXT NOT NULL,
  "result_json" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL
);

CREATE TABLE "schema_migrations" (
  "version" INTEGER PRIMARY KEY,
  "applied_at" INTEGER NOT NULL
);

CREATE INDEX "idx_action_receipts_timestamp" ON "action_receipts"("timestamp");

CREATE INDEX "idx_chat_messages_conversation_created_at" ON "chat_messages"("conversation_id", "created_at");

CREATE INDEX "idx_conversations_updated_at" ON "conversations"("updated_at");

CREATE INDEX "idx_decision_logs_created_at" ON "decision_logs"("created_at");

CREATE INDEX "idx_decision_logs_job_id_created_at" ON "decision_logs"("job_id", "created_at");

CREATE INDEX "idx_http_cache_expires_at" ON "http_cache"("expires_at");

CREATE INDEX "idx_http_cache_source_endpoint" ON "http_cache"("source", "endpoint");

CREATE INDEX "idx_jobs_bot_id_status" ON "jobs"("bot_id", "status");

CREATE INDEX "idx_jobs_status_next_run_at" ON "jobs"("status", "next_run_at");

CREATE INDEX "idx_market_instruments_chain_symbol" ON "market_instruments"("chain", "symbol");

CREATE INDEX "idx_market_snapshots_lookup" ON "market_snapshots"("instrument_id", "source", "snapshot_type", "timestamp");

CREATE INDEX "idx_ohlcv_fetched_at" ON "ohlcv_bars"("fetched_at");

CREATE INDEX "idx_ohlcv_lookup" ON "ohlcv_bars"("instrument_id", "source", "interval", "open_time");

CREATE INDEX "idx_policy_hits_action_name_created_at" ON "policy_hits"("action_name", "created_at");

CREATE INDEX "idx_policy_hits_created_at" ON "policy_hits"("created_at");
```
