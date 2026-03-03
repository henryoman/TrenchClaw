// Trigger: on-chain
//
// Listens for on-chain events via WebSocket subscriptions and fires
// routines when specific conditions are detected.
// Primary use case: sniper bot (detect new token launches / liquidity adds).
//
// Trigger config:
//   type: "newPool" | "liquidityAdd" | "largeTransfer" | "programLog"
//   programId?: string         — Filter events by program (e.g. Raydium, Orca, Pump.fun).
//   mintAddress?: string       — Filter by specific token mint (optional).
//   minLiquidity?: number      — For newPool/liquidityAdd: minimum SOL liquidity to trigger.
//   logPattern?: string        — For programLog: regex pattern to match in logs.
//
// How it works:
//   - Opens a WebSocket connection to the RPC endpoint (via RPC pool).
//   - Subscribes to relevant events:
//       newPool:        logsSubscribe for pool creation program instructions.
//       liquidityAdd:   logsSubscribe for addLiquidity instructions.
//       largeTransfer:  accountSubscribe on tracked wallets.
//       programLog:     logsSubscribe filtered by programId + log pattern.
//   - When an event matches, parse the transaction data to extract:
//       mint address, pool address, liquidity amount, etc.
//   - Enqueue the associated routine (typically sniper) into the scheduler
//     with the parsed event data as input.
//
// Design notes:
//   - WebSocket connection is managed per-trigger instance, not globally.
//   - Reconnect on disconnect with exponential backoff.
//   - Event parsing is program-specific. Each supported DEX (Raydium, Orca, Pump.fun)
//     needs its own log parser. These live alongside this file or in adapters.
//   - This is the most latency-sensitive component. Minimize processing between
//     event receipt and routine dispatch.
