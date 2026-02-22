// Routine: sniper (Token Launch Sniper)
//
// A planner that produces ActionStep[] for sniping a newly launched token.
// Triggered by on-chain events (new pool creation, liquidity add).
//
// Strategy:
//   1. On-chain trigger detects new pool / liquidity event for a target token.
//   2. Sniper routine runs immediately with aggressive timing.
//   3. Buy a configured amount as fast as possible.
//   4. Optionally: set up a sell exit (take-profit or stop-loss) as a follow-up job.
//
// BotConfig fields used:
//   inputMint: string           — Token to spend (SOL).
//   outputMint?: string         — Target token mint (if known in advance, otherwise from trigger event).
//   buyAmount: number           — Amount of SOL to spend on the snipe.
//   slippageBps: number         — Higher than normal (sniping is volatile). e.g. 500 = 5%.
//   maxPriceImpactPct?: number  — Abort if price impact exceeds this (safety rail).
//   exitStrategy?: {
//     type: "take-profit" | "stop-loss" | "timed"
//     target?: number           — For take-profit: sell when token is up X%.
//     stopLoss?: number         — For stop-loss: sell when token is down X%.
//     holdSeconds?: number      — For timed: sell after N seconds regardless.
//   }
//
// Plan produced:
//   Step 1: getTokenMetadata(outputMint)                  [verify token is real]
//   Step 2: getMarketData(outputMint)                     [check liquidity]
//   Step 3: quoteSwap(inputMint → outputMint, buyAmount)  [dependsOn: step 2]
//   Step 4: executeSwap(quoteResponse)                    [dependsOn: step 3]
//   Step 5: (if exitStrategy) scheduler.enqueue(sell job) [dependsOn: step 4]
//
// This routine is unique because it's reactive (trigger-driven) rather than scheduled.
// The on-chain trigger in src/solana/triggers/on-chain.ts fires the sniper.
