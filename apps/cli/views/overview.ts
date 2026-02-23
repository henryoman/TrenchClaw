// TUI View: overview
//
// The main dashboard view. Displayed on TUI boot. Shows at a glance:
//
// Layout (OpenTUI flexbox):
//   ┌─────────────────────────────────────────────┐
//   │  TrenchClaw v0.1.0          [RPC: healthy]  │
//   ├───────────────────────┬─────────────────────┤
//   │  Wallet               │ Active Bots         │
//   │  Address: Abc...xyz   │ DCA #1: running     │
//   │  SOL: 12.345          │ Swing #2: paused    │
//   │  USDC: 500.00         │ Sniper #3: watching │
//   │  Tokens: 3            │                     │
//   ├───────────────────────┴─────────────────────┤
//   │  Recent Actions                             │
//   │  [ok] quoteSwap SOL→BONK      2s ago        │
//   │  [ok] executeSwap SOL→BONK    3s ago        │
//   │  [!!] policy:block maxSlippage 15s ago      │
//   └─────────────────────────────────────────────┘
//
// Data sources:
//   - Wallet section: subscribes to getWalletState action results on event bus.
//   - Active bots: reads from scheduler's job list.
//   - Recent actions: subscribes to action:success, action:fail events.
//   - RPC health: subscribes to rpc:failover events + polls RPC pool health.
//
// Refresh:
//   - Event-driven updates (no polling). Each event bus emission triggers a re-render
//     of the affected section only.
//   - Wallet balance refreshes on a slow interval (every 30s) via scheduled getWalletState.
//
// Keyboard:
//   Tab        → cycle between views (overview, bots, action-feed, controls).
//   q          → quit TUI (runtime keeps running in background).
//   Ctrl+C     → graceful shutdown (stop all bots + exit).
