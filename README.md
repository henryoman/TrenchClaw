# Trenchclaw Roadmap: OpenClaw-Style Solana Bot Runtime

This project is evolving into an **OpenClaw-like trading/runtime framework for Solana** that can support sniping, swing/DCA bots, automation jobs, and safer operator controls.

The goal is a modular system where we can deploy multiple bot types while staying **RPC-agnostic** by relying on common Solana JSON-RPC methods and provider abstraction.

---

## ✅ What We Already Have

### Core trading and strategy capabilities
- [x] Jupiter-based quote + swap flow.
- [x] DCA strategy loop (interval + optional `totalBuys`).
- [x] Swing strategy loop (buy then delayed sell).
- [x] Percentage-cycle strategy.
- [x] Wallet loading/signing from private key.
- [x] Basic schema validation with Zod.

### Basic project/runtime setup
- [x] TypeScript source + build output.
- [x] Config-driven strategy files.
- [x] Bun-based workflow support in repo.

---

## 🧩 What We Should Have to Mimic OpenClaw in the Solana Ecosystem

### 1) Action-first architecture (instead of strategy-only loops)
- [ ] Action registry (`name`, `inputSchema`, `precheck`, `execute`, `postcheck`).
- [ ] Action dispatcher with typed inputs/outputs.
- [ ] Shared context object (wallet state, market state, policy state).
- [ ] Idempotency keys for safe retries.

### 2) Required action inventory
- [ ] `getWalletState` (SOL, SPL balances, ATA state, recent tx summary).
- [ ] `quoteSwap` (route quality, liquidity checks, expected slippage).
- [ ] `executeSwap` (guarded execution + receipts).
- [ ] `riskCheck` (pre-trade and post-trade).
- [ ] `scheduleTask` (generic recurring/one-shot jobs).
- [ ] `cancelTask` (job management).
- [ ] `emergencyStop` (global kill switch).
- [ ] `positionOpen` / `positionClose` primitives.
- [ ] `rebalancePortfolio` action.
- [ ] `simulatePlan` / dry-run mode with deterministic output.
- [ ] `explainDecision` for auditability.

### 3) Risk and policy engine
- [ ] Allowlist/denylist token policy.
- [ ] Max notional per trade + per-day caps.
- [ ] Max slippage policy by token class.
- [ ] Cooldown timers and anti-churn rules.
- [ ] Min liquidity / max price impact guardrails.
- [ ] Volatility-aware sizing rules.
- [ ] Circuit breakers for repeated failures.

### 4) Bot deployment capabilities
- [ ] Bot templates (sniper, DCA, swing, rebalancer, copy-trader style hooks).
- [ ] Per-bot config profiles and secrets handling.
- [ ] Multi-wallet / sub-account support.
- [ ] Supervisor for bot health, restart policy, and heartbeat.
- [ ] Metrics + alerting integration (PnL, errors, latency, fill rate).
- [ ] Structured logs and trace IDs for every action.
- [ ] Backtest and paper-trading mode before live deploy.

### 5) Data and execution quality
- [ ] Token metadata + trust score cache.
- [ ] Price/oracle adapters (with fallbacks).
- [ ] Route comparison across venues where available.
- [ ] Transaction simulation before submit.
- [ ] Confirmation strategy (`processed`/`confirmed`/`finalized` by action type).

### 6) Operator + developer experience
- [ ] CLI/API for managing bots and actions.
- [ ] Dashboard for status, risk, and open jobs.
- [ ] Runbooks for incidents and emergency actions.
- [ ] Test suite for policies and execution flows.
- [ ] Versioned action contracts and migration notes.

---

## 🌐 RPC-Agnostic Plan (Common RPC Methods)

To stay provider-neutral, we will build an internal RPC adapter around common methods and avoid provider-specific lock-in where possible.

### Common JSON-RPC methods we should standardize around
- [ ] `getLatestBlockhash`
- [ ] `sendTransaction`
- [ ] `simulateTransaction`
- [ ] `getSignatureStatuses`
- [ ] `getTransaction`
- [ ] `getBalance`
- [ ] `getTokenAccountsByOwner`
- [ ] `getAccountInfo`
- [ ] `getProgramAccounts`
- [ ] `getBlockHeight`
- [ ] `getSlot`
- [ ] `getHealth` (if provider supports; optional)

### RPC abstraction requirements
- [ ] Provider pool with failover and health scoring.
- [ ] Retry policy by method class (read vs write).
- [ ] Timeout budgets and cancellation handling.
- [ ] Commitment-level strategy per action.
- [ ] Rate-limit and backoff handling.
- [ ] Observability per endpoint (error rate, p95 latency, stale data signals).
- [ ] Feature flags for provider-specific optimizations without tight coupling.

---

## 🚀 Practical Milestones

### Milestone 1: Core runtime refactor
- [ ] Implement action registry + dispatcher.
- [ ] Move current swap flow into `quoteSwap` + `executeSwap`.
- [ ] Add global policy config and `riskCheck` gate.

### Milestone 2: Automation control plane
- [ ] Add `scheduleTask`, `cancelTask`, `emergencyStop`.
- [ ] Add job persistence and restart-safe state.

### Milestone 3: Deployable bots
- [ ] Convert DCA/swing/percentage flows into reusable bot templates.
- [ ] Add per-bot telemetry and health checks.

### Milestone 4: Reliability + trust
- [ ] Add simulation and paper mode.
- [ ] Add integration tests for trade lifecycle and failure recovery.
- [ ] Add decision logs (`explainDecision`) for every automated action.

---

## Definition of Success

We can consider Trenchclaw aligned with an OpenClaw-style Solana runtime when:
- [ ] Bots are composed from reusable actions, not hardcoded loops.
- [ ] Every trade path is guarded by formal risk/policy checks.
- [ ] Deployments are RPC-agnostic and resilient to endpoint failures.
- [ ] Operators can observe, pause, and stop all bot activity instantly.
- [ ] Simulation results and live execution share the same decision model.
