// TrenchClaw — Job Scheduler
//
// Manages recurring and one-shot jobs that drive routine execution.
// Each bot instance gets a job entry in the scheduler.
//
// Responsibilities:
//   - Accept job definitions: routine name, trigger config, bot config.
//   - Maintain a priority queue sorted by nextRunAt.
//   - On tick: find due jobs, create ActionContext, invoke routine to get ActionStep[],
//     pass steps to dispatcher.
//   - After execution: update job state (cyclesCompleted, nextRunAt, lastResult).
//   - Persist all job state to state-store (Bun SQLite). Survive restarts.
//
// Job lifecycle:
//   - PENDING  → job created, waiting for first trigger.
//   - RUNNING  → routine is currently executing.
//   - PAUSED   → operator paused the bot. Skip on tick.
//   - STOPPED  → bot stopped. Remove from active queue.
//   - FAILED   → exceeded max consecutive failures. Needs operator intervention.
//
// Trigger integration:
//   - Timer triggers register jobs directly with cron/interval config.
//   - Price/on-chain triggers call scheduler.enqueue() when their condition fires.
//
// Design notes:
//   - Single scheduler instance per runtime process.
//   - Tick interval: 1 second (configurable).
//   - Jobs don't overlap: if a job is RUNNING when its next tick fires, skip.
//   - The scheduler does NOT execute actions. It invokes routines → dispatcher.
