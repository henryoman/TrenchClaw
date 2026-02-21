# OpenSniper → Solana Agent Transition Plan

This repository is being repurposed from a narrow "scheduled trading bot" into an **OpenClaw-like Solana agent runtime** with clear, composable actions and stronger safety controls.

## Current State (What We Have)

The existing codebase is strongest in one area: **automated Jupiter-based swaps on fixed schedules**.

### Working capabilities
- DCA scheduling with configurable intervals and optional `totalBuys`.
- Swing strategy (buy then delayed sell).
- Percentage-cycle strategy (buy % of SOL, sell later in cycle).
- Solana wallet loading from private key.
- Basic strategy schema validation via Zod.
- Jupiter quote+swap transaction flow.

### Key risks / weak spots
- Agent is strategy-loop driven, not action-driven (hard to extend to broader tasks).
- Tight coupling to specific RPC providers and static env vars.
- No explicit policy engine (allow/deny lists, notional caps, cooldowns, emergency stop).
- No portfolio/risk state model (PnL, exposure, max drawdown checks).
- No simulation framework beyond a basic dev-mode mock path.
- Legacy files and duplicate docs/configs increase confusion.

---

## Target: OpenClaw-like Solana Agent

We should move toward a **tool/action architecture** where each capability is a reusable action with preconditions and safety checks.

## Action Inventory: Need vs Have

| Action | Needed for agent | Current status | Reuse from current repo | Gap / next step |
|---|---|---|---|---|
| `getWalletState` | Core context for every decision | Partial | Connection + key loading + balance checks | Add unified state snapshot (SOL, SPL balances, open positions, recent txs) |
| `quoteSwap` | Price discovery and planning | Partial | Jupiter quote call in `swap.ts` | Separate quote from execution; add route quality checks |
| `executeSwap` | Core execution primitive | Yes (basic) | Existing Jupiter swap submit/sign/send flow | Add slippage guardrails, max notional, per-token permissions |
| `scheduleTask` | Recurring agent jobs | Yes (strategy loops) | DCA/swing/percentage timers | Replace strategy-specific loops with generic scheduler |
| `cancelTask` | Control plane for automation | No | N/A | Add task registry and cancellation API |
| `riskCheck` | Prevent blowups / rugs | Minimal | Special token checks | Formal policy engine (exposure caps, denylist, min liquidity) |
| `positionOpen`/`positionClose` | Higher-level agent behavior | No | Swing logic has partial lifecycle | Build explicit position model + PnL tracking |
| `rebalancePortfolio` | Treasury management | No | N/A | Add target weights + rebalance action |
| `monitorTokenSignals` | Event-driven triggers | No | N/A | Integrate on-chain + market signal adapters |
| `simulatePlan` | Safe dry-runs/backtests | Minimal | DEV mode only | Add deterministic simulation layer + report output |
| `explainDecision` | OpenClaw-like transparency | No | Existing console logs | Persist reason graph for each action |
| `emergencyStop` | Fast risk off-switch | No | N/A | Add global kill switch + persistent locked state |

---

## What We Can Reuse Immediately

1. **Swap transport layer** (Jupiter quote + serialized tx submit).
2. **Config loading + schema validation** patterns (Zod).
3. **Basic scheduling mechanics** from current strategy runners.
4. **Wallet key handling** utilities.

## What We Should Remove / Deprioritize

- Legacy duplicate docs and stale migration artifacts.
- Duplicate strategy config copy files.
- Strategy-specific assumptions hardcoded into core flow.
- Provider-specific assumptions baked into execution path.

---

## Runtime Standard: Bun Only

- Package management: **bun** (`bun install`)
- Unit tests: **bun test**
- Type checks: `bun run typecheck`
- Build output: `bun run build`

Any npm-specific workflows (`npm`, `npx`, `package-lock.json`) are deprecated for this repo.

---

## Proposed Roadmap

### Phase 1 — Cleanup + Foundation
- Keep `swap` and wallet utilities.
- Introduce action interface: `name`, `inputSchema`, `precheck`, `execute`, `postcheck`.
- Add centralized policy config (`allowTokens`, `denyTokens`, `maxTradeUsd`, `maxSlippageBps`, `cooldownSeconds`).
- Add single source of truth docs for architecture and action catalog.

### Phase 2 — Core Agent Actions
- Extract `quoteSwap` and `executeSwap` into separate actions.
- Add `getWalletState`, `riskCheck`, `scheduleTask`, `cancelTask`, `emergencyStop`.
- Build action registry + dispatcher.

### Phase 3 — Intelligent Behavior Layer
- Add `positionOpen/Close`, `rebalancePortfolio`, and signal-triggered actions.
- Add simulation/backtest runner with decision traces.
- Add structured logs for each action and outcome.

### Phase 4 — Hardening
- Add test matrix for safety policies.
- Add failure recovery, retries with bounded backoff, and idempotency keys.
- Add runbooks and operator controls.

---


## Cleanup Completed in This Repo

- Removed duplicate legacy README (`README.md.new`).
- Removed pasted archival artifact under `attached_assets/`.
- Removed duplicate config file (`config/strategies (copy).json`).
- Removed stale runtime log document (`logs.txt`).

---

## Definition of Done for the Transition

This repo will be considered transitioned when:
- Strategy loops are optional wrappers, not the core runtime.
- Action registry exists and powers execution.
- All trade actions pass through policy/risk checks.
- Simulation mode produces decision traces similar to live mode.
- Operator can stop all activity instantly.

