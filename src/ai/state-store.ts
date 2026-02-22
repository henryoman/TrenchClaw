// TrenchClaw — State Store
//
// Persistent storage layer using Bun's built-in SQLite.
// Single file database at ./data/trenchclaw.db (gitignored).
//
// Tables:
//
//   jobs
//     id              TEXT PRIMARY KEY
//     bot_id          TEXT
//     routine_name    TEXT
//     status          TEXT (pending|running|paused|stopped|failed)
//     config          TEXT (JSON blob of BotConfig)
//     next_run_at     INTEGER (unix ms)
//     last_run_at     INTEGER (unix ms)
//     cycles_completed INTEGER
//     total_cycles    INTEGER (nullable, null = infinite)
//     created_at      INTEGER
//     updated_at      INTEGER
//
//   action_receipts
//     id              TEXT PRIMARY KEY (idempotency key)
//     job_id          TEXT (nullable, null if ad-hoc)
//     action_name     TEXT
//     input           TEXT (JSON)
//     result          TEXT (JSON of ActionResult)
//     ok              INTEGER (0|1)
//     tx_signature    TEXT (nullable)
//     duration_ms     INTEGER
//     created_at      INTEGER
//
//   policy_hits
//     id              TEXT PRIMARY KEY
//     action_name     TEXT
//     policy_name     TEXT
//     allowed         INTEGER (0|1)
//     reason          TEXT
//     created_at      INTEGER
//
//   decision_logs
//     id              TEXT PRIMARY KEY
//     job_id          TEXT
//     action_name     TEXT
//     trace           TEXT (JSON array of decision steps)
//     created_at      INTEGER
//
// API surface:
//   - saveJob(job: JobState): void
//   - getJob(id: string): JobState | null
//   - listJobs(filter?): JobState[]
//   - updateJobStatus(id, status, meta?): void
//   - saveReceipt(receipt: ActionResult): void
//   - getReceipt(idempotencyKey: string): ActionResult | null
//   - savePolicyHit(hit: PolicyResult): void
//   - saveDecisionLog(log): void
//   - getRecentReceipts(limit: number): ActionResult[]
//
// Design notes:
//   - Database is created/migrated on first boot (CREATE IF NOT EXISTS).
//   - All writes are synchronous (Bun SQLite is sync). Fine for single-process.
//   - JSON columns use TEXT + JSON.parse/stringify. No ORM.
//   - Data directory is gitignored. Database is operator-local.
