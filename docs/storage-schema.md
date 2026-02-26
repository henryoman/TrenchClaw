# TrenchClaw Storage Schema (SQLite)

Database file: configured by `storage.sqlite.path`.

Runtime-validated TypeScript schema source:
- `src/runtime/storage/sqlite-schema.ts` (Zod, single source of truth for SQLite table row shapes)
- `src/runtime/storage/schema.ts` (runtime payload/input schemas layered on top)
- `src/runtime/storage/sqlite-orm.ts` (Zod-to-SQL mapping + boot-time schema sync)

## Runtime state

### `jobs`
- `id TEXT PRIMARY KEY`
- `bot_id TEXT NOT NULL`
- `routine_name TEXT NOT NULL`
- `status TEXT NOT NULL` (`pending|running|paused|stopped|failed`)
- `config_json TEXT NOT NULL`
- `next_run_at INTEGER`
- `last_run_at INTEGER`
- `cycles_completed INTEGER NOT NULL`
- `total_cycles INTEGER`
- `last_result_json TEXT`
- `created_at INTEGER NOT NULL`
- `updated_at INTEGER NOT NULL`

Indexes:
- `(status, next_run_at)`
- `(bot_id, status)`

### `action_receipts`
- `idempotency_key TEXT PRIMARY KEY`
- `payload_json TEXT NOT NULL`
- `timestamp INTEGER NOT NULL`

Index:
- `(timestamp DESC)`

### `conversations`
- `id TEXT PRIMARY KEY`
- `session_id TEXT`
- `title TEXT`
- `summary TEXT`
- `created_at INTEGER NOT NULL`
- `updated_at INTEGER NOT NULL`

Index:
- `(updated_at DESC)`

### `chat_messages`
- `id TEXT PRIMARY KEY`
- `conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE`
- `role TEXT NOT NULL` (`system|user|assistant|tool`)
- `content TEXT NOT NULL`
- `metadata_json TEXT`
- `created_at INTEGER NOT NULL`

Index:
- `(conversation_id, created_at DESC)`

## Market + chart data

### `market_instruments`
- `id INTEGER PRIMARY KEY`
- `chain TEXT NOT NULL`
- `address TEXT NOT NULL`
- `symbol TEXT`
- `name TEXT`
- `decimals INTEGER`
- `created_at INTEGER NOT NULL`
- `updated_at INTEGER NOT NULL`
- `UNIQUE(chain, address)`

### `ohlcv_bars`
- `instrument_id INTEGER NOT NULL REFERENCES market_instruments(id) ON DELETE CASCADE`
- `source TEXT NOT NULL`
- `interval TEXT NOT NULL`
- `open_time INTEGER NOT NULL`
- `close_time INTEGER NOT NULL`
- `open REAL NOT NULL`
- `high REAL NOT NULL`
- `low REAL NOT NULL`
- `close REAL NOT NULL`
- `volume REAL`
- `trades INTEGER`
- `vwap REAL`
- `fetched_at INTEGER NOT NULL`
- `raw_json TEXT`
- `PRIMARY KEY(instrument_id, source, interval, open_time)`

Indexes:
- `(instrument_id, source, interval, open_time DESC)`
- `(fetched_at DESC)`

### `market_snapshots`
- `id TEXT PRIMARY KEY`
- `instrument_id INTEGER NOT NULL REFERENCES market_instruments(id) ON DELETE CASCADE`
- `source TEXT NOT NULL`
- `snapshot_type TEXT NOT NULL`
- `data_json TEXT NOT NULL`
- `timestamp INTEGER NOT NULL`

Index:
- `(instrument_id, source, snapshot_type, timestamp DESC)`

### `http_cache`
- `cache_key TEXT PRIMARY KEY`
- `source TEXT NOT NULL`
- `endpoint TEXT NOT NULL`
- `request_hash TEXT NOT NULL`
- `response_json TEXT NOT NULL`
- `status_code INTEGER NOT NULL`
- `etag TEXT`
- `last_modified TEXT`
- `fetched_at INTEGER NOT NULL`
- `expires_at INTEGER`

Indexes:
- `(expires_at)`
- `(source, endpoint)`

## Meta

### `schema_migrations`
- `version INTEGER PRIMARY KEY`
- `applied_at INTEGER NOT NULL`

## Where to store what

- Downloaded candles/charts: `ohlcv_bars`
- Latest quote / non-candle payloads: `market_snapshots`
- Reusable raw API payloads with TTL: `http_cache`
- Execution state: runtime tables (`jobs`, `action_receipts`)
- Conversation state: `conversations`, `chat_messages`
