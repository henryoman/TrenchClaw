# Runtime Storage Map

This folder owns runtime persistence and runtime file writes.

## Components

- `sqlite-state-store.ts`
: Bun SQLite-backed implementation of the `StateStore` contract.
  - Tables: `jobs`, `action_receipts`, `policy_hits`, `decision_logs`.
  - Path is configured by `storage.sqlite.path`.

- `file-event-log.ts`
: Bun file writer sink for runtime events.
  - Writes one JSON event file per event into `storage.files.eventsDirectory`.

## Current Runtime Write Surfaces

- Scheduler/dispatcher state
: via `SqliteStateStore` in this folder.

- Event logs
: via `RuntimeFileEventLog` in this folder.

- Wallet export/create action outputs
: `src/solana/actions/wallet-based/create-wallets/createWallets.ts`
  default path: `data/wallets/keypairs`.

- System installer writes
: `scripts/systemd/install.ts` writes systemd/env files under `/etc`.

