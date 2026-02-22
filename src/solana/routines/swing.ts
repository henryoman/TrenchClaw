// Routine: swing (Buy-Wait-Sell Cycles)
//
// A planner that produces ActionStep[] for a single swing cycle.
// Each cycle has two phases: buy and sell, separated by a delay.
//
// Strategy:
//   Phase 1 (buy): Buy target token with a fixed amount.
//   Phase 2 (sell): After a configurable delay, sell all acquired tokens back.
//   Repeat for N cycles or indefinitely.
//
// BotConfig fields used:
//   inputMint: string          — Base token (SOL/USDC) used to buy.
//   outputMint: string         — Token to swing trade.
//   buyAmount: number          — Amount to spend per buy (in inputMint units).
//   sellDelaySeconds: number   — How long to hold before selling.
//   slippageBps: number        — Slippage tolerance for both buy and sell.
//   totalCycles?: number       — Stop after N complete buy-sell cycles.
//
// Plan produced per cycle:
//   Buy phase:
//     Step 1: checkSolBalance()                           [pre-flight check]
//     Step 2: quoteSwap(inputMint → outputMint, buyAmount) [dependsOn: step 1]
//     Step 3: executeSwap(quoteResponse)                  [dependsOn: step 2]
//
//   Sell phase (scheduled separately after sellDelaySeconds):
//     Step 4: checkBalance(outputMint)                    [get actual token balance]
//     Step 5: quoteSwap(outputMint → inputMint, balance)  [dependsOn: step 4]
//     Step 6: executeSwap(quoteResponse)                  [dependsOn: step 5]
//
// The scheduler handles the delay between buy and sell phases.
// Each phase is a separate routine invocation.
//
// Migration note:
//   Replaces _old-src/swing.ts. Removes inline setTimeout scheduling,
//   hardcoded error handling, and direct RPC calls.
