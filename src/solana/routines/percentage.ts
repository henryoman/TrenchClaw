// Routine: percentage (Percentage-of-Balance Cycles)
//
// A planner that produces ActionStep[] for a percentage-based trading cycle.
// Buys with a percentage of current wallet balance, sells at a timed point in the cycle.
//
// Strategy:
//   Phase 1 (buy): Use X% of current SOL balance to buy target token.
//   Phase 2 (sell): At Y% through the cycle duration, sell 100% of acquired tokens.
//   Repeat for N cycles or indefinitely.
//
// BotConfig fields used:
//   inputMint: string              — Base token (SOL).
//   outputMint: string             — Token to trade.
//   buyPercentage: number          — Percentage of wallet balance to use (e.g. 10 = 10%).
//   cycleSeconds: number           — Total cycle duration.
//   sellTimePercentage: number     — When to sell within the cycle (e.g. 75 = sell at 75% through).
//   slippageBps: number            — Slippage tolerance.
//   totalCycles?: number           — Stop after N cycles.
//
// Plan produced for buy phase:
//   Step 1: checkSolBalance()                                    [get current balance]
//   Step 2: quoteSwap(inputMint → outputMint, balance * pct)     [dependsOn: step 1]
//   Step 3: executeSwap(quoteResponse)                           [dependsOn: step 2]
//
// Plan produced for sell phase:
//   Step 4: checkBalance(outputMint)                             [get token balance]
//   Step 5: quoteSwap(outputMint → inputMint, fullBalance)       [dependsOn: step 4]
//   Step 6: executeSwap(quoteResponse)                           [dependsOn: step 5]
//
// Migration note:
//   Replaces _old-src/percentage-trading.ts.
