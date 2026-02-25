# Workspace Context Snapshot

Generated at: 2026-02-24T23:43:39.532Z
Root: src/

This file is generated. Refresh with:
`bun run context:refresh`

## Workspace Map (src/)
```text
# WORKSPACE ROOT: src/
src/
|-- ai/
|   |-- brain/
|   |   |-- db/
|   |   |   |-- logs/
|   |   |   |-- memory/
|   |   |   |   `-- MEMORY.md
|   |   |   |-- runtime/
|   |   |   |   |-- events/
|   |   |   |   |   `-- .keep
|   |   |   |   `-- .keep
|   |   |   |-- sessions/
|   |   |   |   `-- .keep
|   |   |   |-- summaries/
|   |   |   |   `-- .keep
|   |   |   |-- system/
|   |   |   |   `-- .keep
|   |   |   |-- .gitignore
|   |   |   `-- README.md
|   |   |-- knowledge/
|   |   |   |-- skills/
|   |   |   |-- data-structures-as-json.md
|   |   |   |-- dexscreener-actions.md
|   |   |   |-- dexscreener-api-reference.md
|   |   |   |-- helius.md
|   |   |   |-- KNOWLEDGE_MANIFEST.md
|   |   |   |-- knowledge-tree.ts
|   |   |   `-- workspace-and-schema.md
|   |   |-- protected/
|   |   |   `-- system-settings/
|   |   |       |-- profiles/
|   |   |       |   `-- user-default.json
|   |   |       |-- system/
|   |   |       |   |-- context/
|   |   |       |   |-- prompts/
|   |   |       |   |   |-- modes/
|   |   |       |   |   |   `-- operator.md
|   |   |       |   |   |-- payload-manifest.yaml
|   |   |       |   |   `-- system.md
|   |   |       |   |-- safety-modes/
|   |   |       |   |   |-- dangerous.yaml
|   |   |       |   |   |-- safe.yaml
|   |   |       |   |   `-- veryDangerous.yaml
|   |   |       |   `-- ai.json
|   |   |       `-- vault.json
|   |   |-- user-settings/
|   |   |   |-- notifications.yaml
|   |   |   |-- settings.yaml
|   |   |   `-- swap.yaml
|   |   |-- workspace/
|   |   |-- rules.md
|   |   `-- soul.md
|   |-- contracts/
|   |   |-- action.ts
|   |   |-- context.ts
|   |   |-- events.ts
|   |   |-- index.ts
|   |   |-- policy.ts
|   |   |-- scheduler.ts
|   |   `-- state.ts
|   |-- core/
|   |   |-- action-registry.ts
|   |   |-- dispatcher.ts
|   |   |-- event-bus.ts
|   |   |-- index.ts
|   |   |-- policy-engine.ts
|   |   |-- scheduler.ts
|   |   `-- state-store.ts
|   |-- llm/
|   |   |-- client.ts
|   |   |-- config.ts
|   |   |-- index.ts
|   |   |-- prompt-loader.ts
|   |   |-- types.ts
|   |   |-- user-settings-loader.ts
|   |   `-- workspace-map.ts
|   |-- index.ts
|   `-- README.md
|-- apps/
|   |-- chat-connector/
|   |-- cli/
|   |   |-- views/
|   |   |   |-- action-feed.ts
|   |   |   |-- bots.ts
|   |   |   |-- controls.ts
|   |   |   |-- index.ts
|   |   |   |-- overview.ts
|   |   |   `-- welcome.ts
|   |   `-- index.ts
|   |-- seeker-companion/
|   `-- web-gui/
|       |-- src/
|       |   |-- app.css
|       |   |-- App.svelte
|       |   |-- main.ts
|       |   |-- svelte.d.ts
|       |   `-- vite-env.d.ts
|       |-- bun.lock
|       |-- index.html
|       |-- package.json
|       |-- tsconfig.json
|       `-- vite.config.ts
|-- runtime/
|   |-- load/
|   |   |-- authority.ts
|   |   |-- index.ts
|   |   |-- loader.ts
|   |   `-- schema.ts
|   |-- logging/
|   |   |-- index.ts
|   |   `-- runtime-logger.ts
|   |-- storage/
|   |   |-- file-event-log.ts
|   |   |-- index.ts
|   |   |-- memory-log-store.ts
|   |   |-- README.md
|   |   |-- schema.ts
|   |   |-- session-log-store.ts
|   |   |-- session-summary-store.ts
|   |   |-- sqlite-orm.ts
|   |   |-- sqlite-schema.ts
|   |   |-- sqlite-state-store.ts
|   |   `-- system-log-store.ts
|   |-- bootstrap.ts
|   `-- index.ts
|-- solana/
|   |-- actions/
|   |   |-- data-fetch/
|   |   |   |-- alerts/
|   |   |   |   |-- createBlockchainAlert.ts
|   |   |   |   `-- index.ts
|   |   |   |-- api/
|   |   |   |   `-- dexscreener.ts
|   |   |   |-- rpc/
|   |   |   |   |-- getAccountInfo.ts
|   |   |   |   |-- getBalance.ts
|   |   |   |   |-- getMarketData.ts
|   |   |   |   |-- getMultipleAccounts.ts
|   |   |   |   |-- getTokenMetadata.ts
|   |   |   |   |-- getTokenPrice.ts
|   |   |   |   `-- shared.ts
|   |   |   |-- runtime/
|   |   |   |   |-- index.ts
|   |   |   |   `-- queryRuntimeStore.ts
|   |   |   `-- index.ts
|   |   |-- wallet-based/
|   |   |   |-- create-wallets/
|   |   |   |   |-- create-vanity-wallet.sh
|   |   |   |   |-- createWallets.ts
|   |   |   |   |-- index.ts
|   |   |   |   `-- renameWallets.ts
|   |   |   |-- read-only/
|   |   |   |   |-- checkBalance.ts
|   |   |   |   |-- checkSolBalance.ts
|   |   |   |   |-- getWalletState.ts
|   |   |   |   `-- index.ts
|   |   |   |-- swap/
|   |   |   |   |-- rpc/
|   |   |   |   |   |-- executeSwap.ts
|   |   |   |   |   |-- index.ts
|   |   |   |   |   `-- quoteSwap.ts
|   |   |   |   |-- ultra/
|   |   |   |   |   |-- confirmationTracker.ts
|   |   |   |   |   |-- executeSwap.ts
|   |   |   |   |   |-- index.ts
|   |   |   |   |   |-- quoteSwap.ts
|   |   |   |   |   |-- shared.ts
|   |   |   |   |   `-- swap.ts
|   |   |   |   `-- index.ts
|   |   |   |-- token/
|   |   |   |   |-- launch/
|   |   |   |   |   `-- meteora/
|   |   |   |   `-- mint/
|   |   |   |       `-- createToken.ts
|   |   |   |-- transfer/
|   |   |   |   |-- index.ts
|   |   |   |   |-- privacyCash.ts
|   |   |   |   `-- transfer.ts
|   |   |   `-- index.ts
|   |   `-- index.ts
|   |-- lib/
|   |   |-- adapters/
|   |   |   |-- index.ts
|   |   |   |-- jupiter-ultra.ts
|   |   |   |-- jupiter.ts
|   |   |   |-- rpc-pool.ts
|   |   |   |-- token-account.ts
|   |   |   `-- ultra-signer.ts
|   |   |-- ultra/
|   |   |   `-- parsing.ts
|   |   `-- wallet/
|   |       |-- encryption.ts
|   |       |-- hd-derivation.ts
|   |       |-- index.ts
|   |       |-- wallet-manager.ts
|   |       |-- wallet-policy.ts
|   |       |-- wallet-signer.ts
|   |       |-- wallet-store.ts
|   |       `-- wallet-types.ts
|   |-- routines/
|   |   |-- action-sequence.ts
|   |   |-- create-wallets.ts
|   |   |-- dca.ts
|   |   |-- index.ts
|   |   `-- routines.json
|   |-- triggers/
|   |   |-- index.ts
|   |   |-- on-chain.ts
|   |   |-- price.ts
|   |   `-- timer.ts
|   `-- index.ts
`-- types/
    `-- index.ts
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
