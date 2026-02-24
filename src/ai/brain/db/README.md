# Brain DB Layout

Canonical runtime persistence root for TrenchClaw.

## Core layout

- `runtime/`
  - `trenchclaw.db` (+ `-wal`/`-shm`): Bun SQLite state
  - `events/`: structured runtime event files
- `sessions/`
  - `sessions.json`: session index and counters
  - `<sessionId>.jsonl`: per-session transcript/event stream
- `summaries/`
  - `<sessionId>.md`: compact session summary generated at runtime stop
- `system/`
  - `<YYYY-MM-DD>.log`: system/runtime logger output
- `memory/`
  - `MEMORY.md`: curated long-term memory
  - `<YYYY-MM-DD>.md`: daily memory notes

## Source of truth

- SQLite row/table schema: `src/runtime/storage/sqlite-schema.ts`
- Zod -> SQL mapping + boot sync: `src/runtime/storage/sqlite-orm.ts`
