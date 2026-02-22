// TUI View: bots
//
// Detailed view of all bot instances. Shows per-bot status and controls.
//
// Layout (OpenTUI flexbox):
//   ┌─────────────────────────────────────────────┐
//   │  Bots (3 total)                             │
//   ├─────────────────────────────────────────────┤
//   │  ▶ DCA #1                         [running] │
//   │    Routine: dca                             │
//   │    Pair: SOL → BONK                         │
//   │    Amount: 0.1 SOL / cycle                  │
//   │    Cycles: 14 / 100                         │
//   │    Next run: in 4m 32s                      │
//   │    Last result: ok (tx: 5xK...mN2)          │
//   ├─────────────────────────────────────────────┤
//   │  ⏸ Swing #2                       [paused]  │
//   │    Routine: swing                           │
//   │    Pair: SOL → WIF                          │
//   │    Phase: waiting for sell (in 12m)         │
//   │    Cycles: 3 / 10                           │
//   ├─────────────────────────────────────────────┤
//   │  👁 Sniper #3                    [watching] │
//   │    Routine: sniper                          │
//   │    Trigger: on-chain (newPool, Raydium      │
//   │    Buy amount: 0.5 SOL                      │
//   │    Status: listening for events...          │
//   └─────────────────────────────────────────────┘
//
// Data sources:
//   - Job list from scheduler.
//   - Bot config from state-store.
//   - Live status from event bus (bot:start, bot:pause, bot:stop).
//
// Keyboard:
//   Up/Down    → select bot.
//   p          → pause/resume selected bot.
//   s          → stop selected bot.
//   Enter      → expand bot detail (show action history for this bot).
//   Tab        → switch view.
