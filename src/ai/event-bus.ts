// TrenchClaw — Event Bus
//
// Typed event emitter that all runtime components publish to and subscribe from.
// The single communication backbone between execution and presentation layers.
//
// Event types (RuntimeEvent union):
//   action:start    — Dispatched when an action begins execution.
//                     Payload: actionName, input summary, idempotencyKey, timestamp.
//
//   action:success  — Action completed successfully.
//                     Payload: actionName, ActionResult, durationMs.
//
//   action:fail     — Action failed (after all retries exhausted).
//                     Payload: actionName, error, retryable, attempts.
//
//   action:retry    — Action failed but will be retried.
//                     Payload: actionName, attempt number, nextRetryMs.
//
//   bot:start       — Bot/job started or resumed.
//                     Payload: botId, routineName.
//
//   bot:pause       — Bot paused by operator.
//                     Payload: botId, reason.
//
//   bot:stop        — Bot stopped permanently.
//                     Payload: botId, reason, finalStats.
//
//   policy:block    — Policy engine blocked an action.
//                     Payload: actionName, policyName, reason.
//
//   rpc:failover    — RPC pool switched to a different endpoint.
//                     Payload: fromEndpoint, toEndpoint, reason.
//
// Subscribers:
//   - OpenTUI views (live dashboards)
//   - Structured logger (writes to stdout / file)
//   - State store (persists receipts)
//   - Future: webhook/alerting integrations
//
// Design notes:
//   - Use Bun-native EventEmitter or a lightweight typed alternative.
//   - Events are fire-and-forget. Subscribers must not block the emitter.
//   - Event payloads are plain objects (serializable for logging).
