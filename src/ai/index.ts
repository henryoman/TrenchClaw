// TrenchClaw — AI Module Barrel Export
//
// Re-exports all public APIs from the orchestration layer.
// Consumers import from "src/ai" instead of reaching into individual files.
//
// Will export:
//   ActionRegistry   from ./action-registry
//   Dispatcher        from ./dispatcher
//   ActionContext     from ./context
//   PolicyEngine     from ./policy-engine
//   Scheduler        from ./scheduler
//   EventBus         from ./event-bus
//   StateStore       from ./state-store
