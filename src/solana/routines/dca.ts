// Routine: dca (Dollar-Cost Averaging)
//
// A planner that produces ActionStep[] for a single DCA cycle.
// The scheduler invokes this routine on each interval tick.
// The dispatcher executes the returned steps.
//
// Strategy:
//   Buy a fixed amount of a target token at regular intervals.
//   No sell phase. Pure accumulation.
//
// BotConfig fields used:
//   inputMint: string      — Token to spend (typically SOL or USDC).
//   outputMint: string     — Token to accumulate.
//   amount: number         — Fixed amount to buy per cycle (in inputMint units).
//   slippageBps: number    — Slippage tolerance.
//   totalCycles?: number   — Stop after N buys (null = infinite).
//
// Plan produced per cycle:
//   Step 1: quoteSwap(inputMint → outputMint, amount)
//   Step 2: executeSwap(quoteResponse)  [dependsOn: step 1]
//
// The routine does NOT:
//   - Check balances (that's a policy precheck).
//   - Handle retries (that's the dispatcher).
//   - Track cycle count (that's the scheduler/job state).
//   - Decide timing (that's the timer trigger).
//
// Migration note:
//   This replaces _old-src/dca.ts. The old version combined scheduling,
//   execution, error handling, and state tracking in one function.
//   Here, each concern is separated into its own layer.
