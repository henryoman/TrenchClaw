// TUI View: controls
//
// Operator command panel. The "hands on the wheel" view.
// Every destructive action requires confirmation.
//
// Layout (OpenTUI flexbox):
//   ┌─────────────────────────────────────────────┐
//   │  Operator Controls                          │
//   ├─────────────────────────────────────────────┤
//   │                                              │
//   │  [E] EMERGENCY STOP ALL                     │
//   │      Stop all bots, cancel all pending jobs  │
//   │                                              │
//   │  [P] Pause all bots                         │
//   │  [R] Resume all bots                        │
//   │                                              │
//   ├─────────────────────────────────────────────┤
//   │  Bot-specific:                              │
//   │  [1] DCA #1:    ▶ running   [p]ause [s]top │
//   │  [2] Swing #2:  ⏸ paused   [r]esume [s]top │
//   │  [3] Sniper #3: 👁 watching  [s]top         │
//   │                                              │
//   ├─────────────────────────────────────────────┤
//   │  Manual actions:                            │
//   │  [W] Refresh wallet state                   │
//   │  [Q] Quick quote (interactive)              │
//   │                                              │
//   └─────────────────────────────────────────────┘
//
// Emergency Stop:
//   - Sets all jobs to STOPPED status.
//   - Cancels any in-flight dispatcher execution (via AbortController).
//   - Emits bot:stop event for each bot.
//   - Requires confirmation: "Type STOP to confirm"
//
// Data source:
//   - Job list from scheduler (for bot-specific controls).
//   - Event bus (for live status updates).
//
// Design notes:
//   - Controls dispatch commands to the scheduler/dispatcher, not to RPC directly.
//   - Every operator action is emitted to runtime/system/session logs.
//   - Keyboard shortcuts are single-key (no modifier needed) for fast response.
