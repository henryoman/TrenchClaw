# Brain DB Layout

Canonical runtime persistence root for TrenchClaw.

## Core layout

- `runtime.sqlite` (+ `-wal`/`-shm`): Bun SQLite state
- `events/`: structured runtime event files
- `sessions/`:
  - `sessions.json`: active session index and counters (per `sessionKey`)
  - `<sessionId>.jsonl`: per-runtime-session transcript/event stream
    - Runtime restart creates a new `sessionId` and new `.jsonl` file
- `summaries/`:
  - `<sessionId>.md`: compact session summary generated at runtime stop
- `summary/`:
  - `<YYYY-MM-DD>.log`: daily high-level summary log
- `system/`:
  - `<YYYY-MM-DD>.log`: system/runtime logger output
- `memory/`:
  - `MEMORY.md`: curated long-term memory
  - `<YYYY-MM-DD>.md`: daily memory notes

## Source of truth

- SQLite row/table schema: `src/runtime/storage/sqlite-schema.ts`
- Zod -> SQL mapping + boot sync: `src/runtime/storage/sqlite-orm.ts`
