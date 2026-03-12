// Trigger: price
//
// Price-based trigger that fires when a token's price crosses a threshold.
// Used for conditional entries, take-profit exits, and stop-loss exits.
//
// Trigger config:
//   mintAddress: string            — Token to watch.
//   condition: "above" | "below" | "pctChangeUp" | "pctChangeDown"
//   threshold: number              — Price level or percentage change.
//   denomination: "USD" | "SOL"    — What unit the threshold is in.
//   pollIntervalSeconds: number    — How often to check price (default: 10).
//   cooldownSeconds?: number       — Minimum time between fires (prevent rapid re-triggers).
//
// How it works:
//   - On activation, starts polling getTokenPrice action at the configured interval.
//   - Each poll compares current price to threshold.
//   - When condition is met, enqueues the associated routine into the scheduler.
//   - If cooldownSeconds is set, ignore subsequent threshold crossings until cooldown expires.
//
// Used by:
//   - Sniper exit strategies (take-profit / stop-loss).
//   - Conditional DCA (only buy when price is below a level).
//   - Alert-based manual trading (notify user via TUI).
//
// Design notes:
//   - Polling is simple and reliable. WebSocket price feeds can be added later
//     as an optimization without changing the trigger interface.
//   - Price checks use the getTokenPrice action through the dispatcher,
//     so they're subject to the same policy and logging as any other action.
