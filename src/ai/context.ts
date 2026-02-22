// TrenchClaw — Action Context
//
// Mutable runtime state shared across a single dispatch cycle or bot session.
// Passed to every action's precheck, execute, and postcheck methods.
//
// Contains:
//   wallet         — Active Keypair (or public key for read-only actions).
//   rpc            — Reference to the current RPC adapter from the pool.
//   jupiter        — Reference to the Jupiter adapter.
//   tokenAccounts  — Reference to the token account adapter.
//   balances       — Cached SOL and SPL token balances (refreshed per cycle).
//   policies       — Active policy set for this context (can be per-bot overrides).
//   jobMeta        — Current job ID, bot ID, cycle number (if running inside a routine).
//   eventBus       — Reference to the event bus for emitting events.
//
// Design notes:
//   - Context is created fresh for each dispatch cycle, not shared across bots.
//   - Adapters are references (shared), but balance cache is per-context.
//   - Context does NOT contain action logic. It's a data bag + adapter refs.
//   - Factory function: createContext(config) → ActionContext.
