# Brain DB

This folder is the canonical runtime persistence root for TrenchClaw.

## Runtime data layout

- `runtime/trenchclaw.db`
: SQLite state store (`jobs`, `action_receipts`, `policy_hits`, `decision_logs`).

- `runtime/events/`
: File event stream (JSON event files).

- `sessions/sessions.json`
: Session index map (OpenClaw-style session registry).

- `sessions/<sessionId>.jsonl`
: Per-session transcript/event log stream.

- `memory/<YYYY-MM-DD>.md`
: Daily memory notes.

- `memory/MEMORY.md`
: Long-term memory file.

- Wallet export/create action outputs are intentionally written to
  `src/brain/protected/keypairs/` (outside this `db/` tree).
