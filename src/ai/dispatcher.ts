// TrenchClaw — Action Dispatcher
//
// Executes actions resolved from the registry with full lifecycle management.
// This is the only path through which actions run. Nothing calls action.execute() directly.
//
// Execution flow for a single ActionStep:
//   1. Resolve action from registry by name. Throw if not found.
//   2. Validate input against action.inputSchema (Zod). Throw if invalid.
//   3. Generate idempotency key (or use provided one). Check state-store for duplicate.
//   4. Run policy-engine.precheck(). If blocked, emit policy:block event, return early.
//   5. Call action.precheck() if defined. Abort if it throws.
//   6. Call action.execute(). Wrap in timeout. Catch errors.
//   7. Call action.postcheck() if defined.
//   8. Run policy-engine.postcheck(). Log any post-execution warnings.
//   9. Emit action:success or action:fail event on the event bus.
//  10. Save ActionResult receipt to state-store.
//  11. If failed and retryable, apply RetryPolicy (backoff, re-dispatch).
//
// For ActionStep[] (routine plans):
//   - Execute steps in order.
//   - Resolve step dependencies via dependsOn (idempotency key of prior step).
//   - If a step fails and is not retryable, abort remaining steps.
//   - Return aggregated results.
//
// Design notes:
//   - The dispatcher is stateless itself. All state goes through context + state-store.
//   - Idempotency: if a key already has a successful receipt, return cached result.
//   - Timeout: configurable per action, default 30s. Uses AbortController.
