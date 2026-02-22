// TUI View: action-feed
//
// Live scrolling feed of all dispatched actions and their results.
// Think of it as the runtime's activity log rendered in real time.
//
// Layout (OpenTUI flexbox):
//   ┌─────────────────────────────────────────────┐
//   │  Action Feed (live)                  [auto]  │
//   ├─────────────────────────────────────────────┤
//   │  19:42:01  [ok]  checkSolBalance     12ms   │
//   │  19:42:01  [ok]  quoteSwap            89ms  │
//   │            SOL → BONK, out: 142,301         │
//   │            impact: 0.12%                     │
//   │  19:42:02  [ok]  executeSwap         1204ms │
//   │            tx: 5xK...mN2                     │
//   │  19:42:15  [!!]  policy:block                │
//   │            maxSlippage exceeded (3.2% > 2%)  │
//   │  19:42:15  [--]  executeSwap         SKIP   │
//   │  19:42:30  [ok]  checkSolBalance     8ms    │
//   │  19:42:31  [!!]  quoteSwap           FAIL   │
//   │            COULD_NOT_FIND_ANY_ROUTE          │
//   │  19:42:31  [↻]   quoteSwap           retry  │
//   │            attempt 2/3, next in 2s           │
//   └─────────────────────────────────────────────┘
//
// Event types displayed:
//   [ok]  → action:success (green)
//   [!!]  → action:fail or policy:block (red)
//   [↻]   → action:retry (yellow)
//   [--]  → skipped (gray)
//   [◉]   → rpc:failover (orange)
//
// Data source:
//   - Subscribes to ALL event bus events.
//   - Formats each event into a timestamped log line.
//   - Auto-scrolls to bottom. Manual scroll pauses auto-scroll.
//
// Keyboard:
//   Space      → pause/resume auto-scroll.
//   /          → filter by action name or bot ID.
//   c          → clear feed.
//   Tab        → switch view.
