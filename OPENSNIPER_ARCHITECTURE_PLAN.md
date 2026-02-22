# Trenchclaw: Detailed Architecture Plan (OpenClaw-Inspired, Solana Kit 6.1)

## 1) Executive Summary

Trenchclaw should evolve into an **OpenClaw-style, action-driven bot runtime for Solana**, using **Solana Kit 6.1** as the core chain integration layer. The platform should support:

- high-frequency token swap execution,
- strategy bots (DCA, swing, momentum, percentage cycles),
- operator-managed automation,
- risk-governed execution,
- multi-wallet orchestration,
- simulation, paper, and live environments.

The key architectural shift is from script-centric loops to a **runtime with reusable actions + policy gates + scheduling + observability**.

---

## 2) Product Vision

Trenchclaw is positioned as:

- **"OpenClaw for Solana"** (modular bot runtime),
- **execution-first** (reliable swap primitives, confirmations, route sanity checks),
- **risk-aware by default** (policy engine before and after every trade),
- **operator-friendly** (runbooks, kill switches, dashboards, event logs),
- **extensible** (new strategy modules added without touching the execution core).

In practical terms:

1. A bot should describe **intent** (e.g., "buy 0.2 SOL of token X every 6h if liquidity > threshold").
2. The runtime should convert intent to **actions** (quote, validate, simulate, execute, confirm, reconcile).
3. Every action should be traceable, replayable (in simulation), and policy-checked.

---

## 3) Target Capability Matrix

### 3.1 Core trading primitives

- Quote swap across available route providers.
- Validate route quality, slippage, expected output, and fees.
- Simulate transaction before broadcast.
- Execute transaction with configurable confirmation strategy.
- Reconcile on-chain state after confirmation.

### 3.2 Bot types (first-class)

- **DCA bot**: interval buys with cap rules and optional stop conditions.
- **Swing bot**: entry and delayed/condition-based exit.
- **Percentage-cycle bot**: cyclic buy/sell based on configured bands.
- **Sniper bot**: event-triggered launch/market-entry flow with strict risk controls.
- **Portfolio rebalance bot**: target allocation enforcement.

### 3.3 Control plane and operations

- Job scheduler for one-shot and recurring jobs.
- Pause/resume/cancel controls per bot and globally.
- Emergency stop with immediate execution halt.
- Persistent bot state (restart-safe).
- Structured telemetry and decision/audit logs.

### 3.4 Safety and governance

- Token allowlist/denylist.
- Max notional per trade, per bot, per day.
- Liquidity and price impact constraints.
- Cooldown/anti-churn logic.
- Circuit breakers for repeated failures.
- Optional human approval hooks for high-risk actions.

---

## 4) OpenClaw-Inspired Runtime Model

The runtime should be organized around **Action Contracts**.

Each action exposes:

- `name`
- `version`
- `inputSchema`
- `outputSchema`
- `precheck(context, input)`
- `execute(context, input)`
- `postcheck(context, output)`

Examples:

- `wallet.getState`
- `market.getQuote`
- `trade.simulate`
- `trade.executeSwap`
- `risk.evaluate`
- `task.schedule`
- `task.cancel`
- `system.emergencyStop`

### Why this model?

- Strategy code remains thin and declarative.
- Shared concerns (risk, retries, observability) are centralized.
- Easier to test and to move from paper mode to live mode.
- Better compatibility with CLI/API/UI and future plugins.

---

## 5) Solana Kit 6.1 Integration Approach

Use Solana Kit 6.1 as the canonical blockchain adapter layer, with wrappers for:

- key management and signing,
- connection/provider pooling,
- transaction build/simulate/send/confirm,
- token account queries,
- account and metadata retrieval.

### Adapter boundaries

- `ChainAdapter` interface in runtime core.
- `SolanaKitAdapter` implementation powered by Solana Kit 6.1.
- Optional future adapters for test/mocked environments.

### RPC neutrality

Even while using Solana Kit 6.1, the runtime should maintain provider abstraction:

- endpoint health scoring,
- fallback routing,
- per-method timeout and retry policies,
- commitment strategy by action type,
- endpoint-level observability (latency/error/finality lag).

---

## 6) Proposed New File Structure (Based on OpenClaw Patterns)

```text
Trenchclaw/
├─ docs/
│  ├─ architecture/
│  │  ├─ runtime-overview.md
│  │  ├─ action-contracts.md
│  │  ├─ risk-policy-model.md
│  │  └─ solana-kit-adapter.md
│  ├─ operations/
│  │  ├─ runbooks.md
│  │  ├─ emergency-stop.md
│  │  └─ incident-response.md
│  └─ bots/
│     ├─ dca.md
│     ├─ swing.md
│     ├─ sniper.md
│     └─ rebalance.md
│
├─ src/
│  ├─ app/
│  │  ├─ bootstrap.ts
│  │  ├─ container.ts
│  │  └─ lifecycle.ts
│  │
│  ├─ core/
│  │  ├─ actions/
│  │  │  ├─ contracts.ts
│  │  │  ├─ registry.ts
│  │  │  ├─ dispatcher.ts
│  │  │  └─ builtins/
│  │  │     ├─ wallet.get-state.ts
│  │  │     ├─ market.get-quote.ts
│  │  │     ├─ trade.simulate.ts
│  │  │     ├─ trade.execute-swap.ts
│  │  │     ├─ risk.evaluate.ts
│  │  │     ├─ task.schedule.ts
│  │  │     ├─ task.cancel.ts
│  │  │     └─ system.emergency-stop.ts
│  │  │
│  │  ├─ runtime/
│  │  │  ├─ context.ts
│  │  │  ├─ execution-engine.ts
│  │  │  ├─ idempotency.ts
│  │  │  ├─ receipts.ts
│  │  │  └─ decision-log.ts
│  │  │
│  │  ├─ policy/
│  │  │  ├─ policy-engine.ts
│  │  │  ├─ rules/
│  │  │  │  ├─ token-policy.ts
│  │  │  │  ├─ max-notional.ts
│  │  │  │  ├─ slippage-limits.ts
│  │  │  │  ├─ liquidity-checks.ts
│  │  │  │  └─ cooldown.ts
│  │  │  └─ circuit-breaker.ts
│  │  │
│  │  └─ scheduler/
│  │     ├─ scheduler.ts
│  │     ├─ job-store.ts
│  │     └─ heartbeat.ts
│  │
│  ├─ bots/
│  │  ├─ base/
│  │  │  ├─ bot-contract.ts
│  │  │  ├─ bot-runner.ts
│  │  │  └─ bot-state.ts
│  │  ├─ dca/
│  │  │  ├─ dca-bot.ts
│  │  │  ├─ dca-config.ts
│  │  │  └─ dca-plan.ts
│  │  ├─ swing/
│  │  │  ├─ swing-bot.ts
│  │  │  └─ swing-config.ts
│  │  ├─ sniper/
│  │  │  ├─ sniper-bot.ts
│  │  │  ├─ triggers.ts
│  │  │  └─ launch-guards.ts
│  │  └─ rebalance/
│  │     ├─ rebalance-bot.ts
│  │     └─ rebalance-config.ts
│  │
│  ├─ integrations/
│  │  ├─ chain/
│  │  │  ├─ chain-adapter.ts
│  │  │  └─ solana-kit/
│  │  │     ├─ adapter.ts
│  │  │     ├─ tx-builder.ts
│  │  │     ├─ account-reader.ts
│  │  │     └─ provider-pool.ts
│  │  ├─ venues/
│  │  │  ├─ router-interface.ts
│  │  │  ├─ jupiter-router.ts
│  │  │  └─ route-comparator.ts
│  │  └─ prices/
│  │     ├─ oracle-interface.ts
│  │     └─ oracle-fallbacks.ts
│  │
│  ├─ config/
│  │  ├─ env.ts
│  │  ├─ schemas/
│  │  │  ├─ bot-config.schema.ts
│  │  │  ├─ policy.schema.ts
│  │  │  └─ strategy.schema.ts
│  │  ├─ defaults/
│  │  │  ├─ policy.defaults.ts
│  │  │  └─ runtime.defaults.ts
│  │  └─ profiles/
│  │     ├─ dev.json
│  │     ├─ paper.json
│  │     └─ prod.json
│  │
│  ├─ interfaces/
│  │  ├─ cli/
│  │  │  ├─ index.ts
│  │  │  ├─ commands/
│  │  │  │  ├─ bot.start.ts
│  │  │  │  ├─ bot.stop.ts
│  │  │  │  ├─ task.list.ts
│  │  │  │  └─ emergency-stop.ts
│  │  ├─ api/
│  │  │  ├─ server.ts
│  │  │  ├─ routes/
│  │  │  │  ├─ bots.ts
│  │  │  │  ├─ tasks.ts
│  │  │  │  └─ health.ts
│  │  │  └─ middleware/
│  │  │     ├─ auth.ts
│  │  │     └─ request-id.ts
│  │  └─ dashboard/
│  │     └─ (optional frontend)
│  │
│  ├─ observability/
│  │  ├─ logger.ts
│  │  ├─ metrics.ts
│  │  ├─ traces.ts
│  │  └─ alerts.ts
│  │
│  ├─ storage/
│  │  ├─ repositories/
│  │  │  ├─ bots.repo.ts
│  │  │  ├─ jobs.repo.ts
│  │  │  ├─ trades.repo.ts
│  │  │  └─ decisions.repo.ts
│  │  └─ migrations/
│  │
│  ├─ testing/
│  │  ├─ fixtures/
│  │  ├─ mocks/
│  │  ├─ integration/
│  │  └─ replay/
│  │
│  └─ index.ts
│
├─ config/
│  ├─ strategies/
│  ├─ bots/
│  └─ policies/
│
├─ scripts/
│  ├─ seed-config.ts
│  ├─ migrate.ts
│  └─ smoke-check.ts
│
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
│
└─ TRENCHCLAW_ARCHITECTURE_PLAN.md
```

---

## 7) Migration Plan from Current Structure

### Phase 0: Stabilize current behavior

- Freeze current strategy scripts as reference baseline.
- Add golden tests for current DCA/swing/percentage behavior.
- Capture current config and runtime assumptions.

### Phase 1: Introduce runtime core

- Implement action contracts, registry, dispatcher.
- Move swap logic into `market.get-quote` + `trade.execute-swap` actions.
- Add shared context, receipts, and decision logging.

### Phase 2: Add policy gate

- Implement policy engine and mandatory pre-trade evaluation.
- Add configurable risk profiles (dev/paper/prod).
- Add circuit breaker and global emergency stop.

### Phase 3: Scheduler + bot runner

- Add persistent job scheduler.
- Convert DCA/swing/percentage scripts into bot modules using core actions.
- Implement lifecycle controls (start/stop/pause/resume).

### Phase 4: Observability and operator surfaces

- Structured logs with trace IDs.
- Metrics for execution latency, fill quality, and bot health.
- CLI/API controls for operations.

### Phase 5: Advanced bot set

- Add sniper and portfolio rebalance bots.
- Add simulation replay and paper mode parity.
- Add richer route/venue comparison and optional strategy plugins.

---

## 8) Initial Backlog (Concrete Tickets)

1. Create `ActionContract` types + Zod schema bindings.
2. Create action dispatcher with retry and idempotency support.
3. Implement `risk.evaluate` action and baseline rules.
4. Build `SolanaKitAdapter` for read/simulate/send/confirm.
5. Split Jupiter integration into route quote and execution layers.
6. Create scheduler persistence model for recurring jobs.
7. Build DCA bot on top of action contracts.
8. Build swing bot on top of action contracts.
9. Add structured `DecisionLogEvent` for every action invocation.
10. Add CLI command set for bot lifecycle and emergency stop.

---

## 9) Non-Functional Requirements

- **Reliability**: restart-safe job state and deterministic recovery behavior.
- **Performance**: strict timeout budgets for read/write RPC methods.
- **Security**: secure secret handling and environment profile isolation.
- **Auditability**: complete decision trail with action input/output hashes.
- **Testability**: replay tests from recorded quotes and chain snapshots.
- **Extensibility**: versioned action contracts for non-breaking evolution.

---

## 10) Definition of Done for “OpenClaw-like on Solana”

Trenchclaw can be considered aligned when:

- bots are assembled from action contracts instead of direct loops,
- every trade is risk-checked and recorded with decision logs,
- simulation and live modes run the same decision pipeline,
- operators can supervise and stop bots in real time,
- the system remains provider-flexible while powered by Solana Kit 6.1.

