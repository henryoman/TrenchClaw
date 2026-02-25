// Trigger: timer
//
// Time-based trigger that fires routine invocations on a schedule.
// Drives DCA, swing, and percentage routines.
//
// Trigger config:
//   type: "interval" | "cron"
//   intervalSeconds?: number  — For interval: fire every N seconds.
//   cron?: string             — For cron: standard cron expression.
//
// How it works:
//   - On bot start, the timer trigger registers a job with the scheduler.
//   - The scheduler's tick loop checks if the job is due.
//   - When due, the scheduler invokes the associated routine.
//   - After execution, the scheduler computes nextRunAt based on trigger config.
//
// For swing routines with a sell delay:
//   - The buy phase fires on the normal interval.
//   - After buy completes, the routine tells the scheduler to enqueue
//     the sell phase as a one-shot job with a delay of sellDelaySeconds.
//
// Design notes:
//   - Timer triggers don't run their own setTimeout/setInterval loops.
//     They configure the scheduler, which manages all timing centrally.
//   - This avoids timer drift, overlapping executions, and zombie timers.
