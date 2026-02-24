# TrenchClaw Architecture

TrenchClaw is an OpenClaw-style runtime for the Solana blockchain. It composes modular chain actions into automated trading strategies, enforced by a policy engine, scheduled by a job system, and operated through an OpenTUI terminal interface.

---

## Design Principles

1. **Action-first.** Every chain interaction is a registered, typed, policy-gated action. No raw RPC calls in business logic.
2. **Separation of intent and execution.** Routines (DCA, swing, sniper) declare *what* to do. The dispatcher handles *how* (retries, idempotency, timeouts).
3. **RPC-agnostic.** All chain communication goes through adapters. Swap providers, change nothing else.
4. **Observable by default.** Every action emits structured events. The TUI, logs, and future metrics all consume the same event bus.
5. **Restart-safe.** Job state, action receipts, and decision logs persist in Bun SQLite. Crash and resume without losing position.
6. **IDL-driven clients.** On-chain program interactions use generated TypeScript clients from Anchor IDL files. No hand-rolled instruction builders.

---

## Folder Map

```
trenchclaw/
├── index.ts                         # Entrypoint: boots runtime, starts CLI or headless
├── ARCHITECTURE.md                  # This file
├── README.md                        # Project overview + roadmap
├── .env.example                     # Required env vars
├── package.json
├── tsconfig.json
├── bun.lock
│
├── lib/
│   └── client/
│       ├── README.md                # How to generate typed clients from IDLs
│       └── idl/                     # Anchor IDL JSON files (input for codegen)
│           └── .gitkeep
│
├── src/
│   ├── types/
│   │   └── index.ts                 # Shared contracts: Action, ActionResult, ActionContext, Policy
│   │
│   ├── ai/                          # The Brain — orchestration layer
│   │   ├── index.ts                 # Re-exports
│   │   ├── action-registry.ts       # Register actions by name + schema, auto-discover from fs
│   │   ├── dispatcher.ts            # Execute actions: retry, timeout, idempotency, policy gates
│   │   ├── context.ts               # Shared runtime state: wallet, RPC, balances, active jobs
│   │   ├── policy-engine.ts         # Pre/post execution rules: allowlists, caps, slippage, cooldowns
│   │   ├── scheduler.ts             # Job scheduling: cron, interval, one-shot, persistent queue
│   │   ├── event-bus.ts             # Typed event emitter: action results, errors, state changes
│   │   └── state-store.ts           # Bun SQLite: job state, action receipts, decision logs
│   │
│   ├── brain/                       # The Soul — agent knowledge, persona, and external context
│   │   ├── soul.md                  # Core identity, mission, and long-term behavior style
│   │   ├── rules.md                 # High-level behavioral constraints and operator policies
│   │   ├── skills/                  # Curated skill docs, playbooks, and capability notes
│   │   └── db/                      # Committed external knowledge snapshots (for now)
│   │
│   ├── solana/
│   │   ├── adapters/                # Chain communication abstraction
│   │   │   ├── index.ts             # Re-exports
│   │   │   ├── rpc-pool.ts          # RPC provider pool: failover, health scoring, retry policy
│   │   │   ├── jupiter.ts           # Jupiter API client: quote, swap, route comparison
│   │   │   └── token-account.ts     # SPL token account queries: balances, ATAs, metadata
│   │   │
│   │   ├── actions/                 # Chain execution primitives (one action per file)
│   │   │   ├── data-based/          # No wallet required
│   │   │   │   ├── getTokenPrice.ts
│   │   │   │   ├── getTokenMetadata.ts
│   │   │   │   └── getMarketData.ts
│   │   │   │
│   │   │   └── wallet-based/        # Wallet signing required
│   │   │       ├── read-only/
│   │   │       │   ├── checkSolBalance.ts
│   │   │       │   ├── checkBalance.ts
│   │   │       │   └── getWalletState.ts
│   │   │       ├── swap/
│   │   │       │   ├── quoteSwap.ts
│   │   │       │   └── executeSwap.ts
│   │   │       ├── transfer/
│   │   │       │   ├── transferSol.ts
│   │   │       │   └── transferToken.ts
│   │   │       └── mint/
│   │   │           └── token/
│   │   │               └── createToken.ts
│   │   │
│   │   ├── wallet/                  # Wallet management (Turnkey-inspired, local)
│   │   │   ├── index.ts             # Re-exports
│   │   │   ├── wallet-types.ts      # Wallet, WalletAccount, WalletPolicy, SigningRequest types
│   │   │   ├── wallet-manager.ts    # Create, derive, import, export, delete wallets
│   │   │   ├── wallet-store.ts      # Encrypted wallet persistence (Bun SQLite)
│   │   │   ├── wallet-signer.ts     # Signer factory: wallet ID → Kit KeyPairSigner
│   │   │   ├── wallet-policy.ts     # Per-wallet signing policies (deny > allow, implicit deny)
│   │   │   ├── hd-derivation.ts     # BIP44 HD derivation for Solana (m/44'/501'/n'/0')
│   │   │   └── encryption.ts        # AES-256-GCM encryption for key material at rest
│   │   │
│   │   ├── routines/                # Composed strategies (planners, not executors)
│   │   │   ├── dca.ts
│   │   │   ├── swing.ts
│   │   │   ├── percentage.ts
│   │   │   └── sniper.ts
│   │   │
│   │   └── triggers/                # Event sources that enqueue work
│   │       ├── timer.ts
│   │       ├── price.ts
│   │       └── on-chain.ts
│   │
│   └── app/
│       └── cli/                     # Operator interface (OpenTUI)
│           ├── index.ts             # CLI entrypoint: parse args, boot TUI or run command
│           └── views/
│               ├── overview.ts      # Dashboard: wallet, active bots, recent actions
│               ├── bots.ts          # Bot list: status, cycles, P&L summary
│               ├── action-feed.ts   # Live stream of dispatched actions + results
│               └── controls.ts      # Operator commands: pause, resume, stop, emergency kill
```

---

## Data Flow

```
Trigger (timer/price/on-chain)
  │
  ▼
Routine (dca/swing/sniper)
  │  produces ActionStep[]
  ▼
Dispatcher
  │  for each step:
  │    1. policy-engine.precheck()
  │    2. action.execute() via adapter
  │    3. policy-engine.postcheck()
  │    4. event-bus.emit(result)
  │    5. state-store.save(receipt)
  ▼
Event Bus
  │
  ├── → OpenTUI views (live update)
  ├── → Structured logs
  └── → Future: metrics/alerting
```

---

## Shared Contracts

Every action in the system implements one interface:

```typescript
interface Action<TInput, TOutput> {
  name: string;
  category: "data-based" | "wallet-based";
  subcategory?: "read-only" | "swap" | "transfer" | "mint";
  inputSchema: ZodSchema<TInput>;
  outputSchema: ZodSchema<TOutput>;
  precheck?: (ctx: ActionContext, input: TInput) => Promise<void>;
  execute: (ctx: ActionContext, input: TInput) => Promise<ActionResult<TOutput>>;
  postcheck?: (ctx: ActionContext, input: TInput, output: ActionResult<TOutput>) => Promise<void>;
}
```

Every action returns:

```typescript
interface ActionResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  retryable: boolean;
  txSignature?: string;
  durationMs: number;
  timestamp: number;
  idempotencyKey: string;
  decisionTrace?: string[];
}
```

Routines produce plans, not side effects:

```typescript
interface ActionStep {
  actionName: string;
  input: unknown;
  dependsOn?: string;   // idempotency key of a prior step
  retryPolicy?: RetryPolicy;
}
```

---

## Layer Responsibilities

### `lib/client/idl/`
- Contains raw Anchor IDL `.json` files for any on-chain programs TrenchClaw interacts with.
- Generated TypeScript clients live in `lib/client/` alongside.
- Use `coda generate` or `anchor-client-gen` to produce typed instruction builders, account decoders, PDA helpers, and error enums.
- Actions in `src/solana/actions/` import from `lib/client/`, never build instructions manually.

### `src/types/`
- Single source of truth for all shared interfaces: `Action`, `ActionResult`, `ActionContext`, `Policy`, `RetryPolicy`, `ActionStep`, `BotConfig`, `JobState`.
- Every other module imports from here.
- Zod schemas and TypeScript types co-located.

### `src/ai/` — The Brain
- **action-registry**: Map of action name → action definition. Auto-discovers action files from `src/solana/actions/`. Validates schema on registration.
- **dispatcher**: Takes an `ActionStep` or `ActionStep[]`, resolves the action from registry, runs precheck → execute → postcheck, handles retries and idempotency. Never touches RPC directly.
- **context**: Mutable runtime state shared across a dispatch cycle. Holds wallet reference, current RPC adapter, cached balances, active policy set, and job metadata.
- **policy-engine**: Evaluates rules before and after execution. Token allowlists/denylists, max notional per trade, per-day caps, slippage limits, cooldown timers, circuit breakers.
- **scheduler**: Manages recurring and one-shot jobs. Each job references a routine + trigger config. Persists to state-store so jobs survive restarts.
- **event-bus**: Typed `EventEmitter`. Events: `action:start`, `action:success`, `action:fail`, `action:retry`, `bot:start`, `bot:pause`, `bot:stop`, `policy:block`, `rpc:failover`.
- **state-store**: Bun SQLite database. Tables: `jobs`, `action_receipts`, `policy_hits`, `bot_heartbeats`, `decision_logs`. Provides typed query helpers.

### `src/brain/` — Agent Knowledge Layer
- **soul.md**: Defines the operator-facing identity and stable strategic intent of the agent.
- **rules.md**: Human-authored behavior rules and mission constraints that shape planning.
- **skills/**: Domain playbooks and capability-specific guidance documents.
- **db/**: External data snapshots curated for the agent's reasoning context.
- This layer is loaded by orchestration in `src/ai/`, but remains content-focused (knowledge) rather than process-focused (execution).
- `src/brain/db/` is intentionally **committed** for now to keep outside/context data versioned with the repo.

### `src/solana/adapters/` — Chain Abstraction
- **rpc-pool**: Manages multiple RPC endpoints (Helius, QuickNode, etc). Health scoring per endpoint, automatic failover, retry policy by method class (reads vs writes), commitment level per request.
- **jupiter**: Wraps Jupiter API (quote, swap, route comparison). Handles serialization, versioned transactions, priority fees. Used by swap actions.
- **token-account**: SPL token account queries. Get balances, find/create ATAs, resolve decimals, fetch metadata. Used by read-only and transfer actions.

### `src/solana/wallet/` — Wallet Management
- Turnkey-inspired wallet infrastructure implemented locally with Solana Kit primitives.
- **wallet-types**: All interfaces (Wallet, WalletAccount, WalletPolicy, SigningRequest).
- **wallet-manager**: Wallet lifecycle — create HD wallet, import from mnemonic or base58 key, derive accounts, export, delete.
- **wallet-store**: SQLite persistence for wallets, accounts, policies, and signing audit log.
- **wallet-signer**: Signer factory — decrypts key material and returns a Kit `KeyPairSigner`. The only module that touches raw private keys.
- **wallet-policy**: Per-wallet signing policy engine. Evaluates conditions (amount caps, address allowlists, program blocklists, cooldowns, time windows) before every signing request. Deny overrides allow. Implicit deny by default.
- **hd-derivation**: BIP44 Solana derivation (`m/44'/501'/n'/0'`). Derive multiple accounts from one seed.
- **encryption**: AES-256-GCM via Web Crypto API. PBKDF2 key derivation from operator passphrase. No plaintext keys on disk.
- Full design: [`WALLET_MANAGEMENT.md`](./WALLET_MANAGEMENT.md)

### `src/solana/actions/` — Execution Primitives
- One file per action. Each file exports a single `Action<TInput, TOutput>` conforming to the shared contract.
- **data-based**: No wallet needed. Price feeds, token metadata, market data aggregation.
- **wallet-based/read-only**: Wallet public key needed but no signing. Balance checks, full wallet state snapshot.
- **wallet-based/swap**: Jupiter quote and guarded execution. These are the core trade actions.
- **wallet-based/transfer**: SOL and SPL token transfers.
- **wallet-based/mint/token**: Token creation via Metaplex or SPL Token program.

### `src/solana/routines/` — Strategy Playbooks
- Each routine is a function that takes a `BotConfig` and returns `ActionStep[]`.
- Routines are planners, not executors. They compute what to do based on config and current context.
- The dispatcher executes the steps. The scheduler re-invokes the routine on the configured interval.
- **dca**: Fixed-amount buys at regular intervals.
- **swing**: Buy → wait → sell cycles.
- **percentage**: Percentage-of-balance buy → timed sell.
- **sniper**: Watch for token launch/liquidity event → immediate buy → configurable exit.

### `src/solana/triggers/` — Event Sources
- Triggers watch for conditions and enqueue routine invocations into the scheduler.
- **timer**: Cron expressions or fixed intervals. Drives DCA, swing, percentage routines.
- **price**: Watch token price via adapter. Fire when crossing a threshold (above/below/percent-change).
- **on-chain**: WebSocket subscription to on-chain events (new pool creation, large transfers, program logs). Drives sniper and reactive strategies.

### `src/app/cli/` — Operator Interface
- **index.ts**: CLI entrypoint. Parses args (`start`, `status`, `stop`, `tui`). Boots OpenTUI or runs single commands.
- **views/overview**: Main dashboard. Wallet balances, active bot count, last N actions, RPC health indicator.
- **views/bots**: Per-bot detail. Status, current cycle, P&L estimate, next scheduled action.
- **views/action-feed**: Live scrolling feed of dispatched actions, results, and policy blocks.
- **views/controls**: Operator commands. Pause/resume individual bots, emergency stop all, force-retry a failed action.

---

## Entrypoints

| Command | What it does |
|---|---|
| `bun run dev` | Boot runtime + OpenTUI in development mode |
| `bun run start` | Boot runtime + OpenTUI in production mode |
| `bun run headless` | Boot runtime without TUI (for server/daemon deployment) |
| `bun run cli -- status` | One-shot CLI command, print status and exit |
| `bun run systemd:install` | Install/update Linux systemd unit and config files |

---

## Linux systemd (Bun)

TrenchClaw ships a Bun-based installer plus service template in `deploy/systemd/`.

```bash
sudo bun run systemd:install
sudo systemctl daemon-reload
sudo systemctl enable trenchclaw
sudo systemctl restart trenchclaw
```

Config ownership is split:

- User-editable: `/etc/trenchclaw/user.env` and `/etc/trenchclaw/settings.user.yaml`
- Agent/runtime-editable: `/etc/trenchclaw/agent.env` and `/etc/trenchclaw/settings.agent.yaml`

Merged runtime config precedence:

1. Bundled base profile (`src/settings/default.yaml` or `src/settings/safe.yaml`)
2. User override (`TRENCHCLAW_SETTINGS_USER_FILE`)
3. Agent override (`TRENCHCLAW_SETTINGS_AGENT_FILE`)

Later layers override earlier ones.

---

## Environment

```env
HELIUS_API_KEY=           # Primary RPC provider
QUICKNODE_API_KEY=        # Secondary RPC provider
RPC_URL=                  # Override: custom RPC endpoint
ULTRA_API_KEY=            # Optional: additional services
PRIVATE_KEY=              # Base58 wallet private key
```

---

## Key Design Decisions

1. **Why `src/ai/` for orchestration?** — It's the decision-making layer. Whether driven by config rules today or AI agent planning tomorrow, the interface stays the same. The name leaves room to grow.

2. **Why `lib/client/idl/` separate from `src/`?** — Generated code doesn't belong in source. IDL files are inputs, generated clients are artifacts. Keep them out of the business logic tree.

3. **Why adapters between actions and RPC?** — Provider lock-in is the #1 operational risk for Solana bots. The adapter layer means you can swap Helius for QuickNode or a private validator without touching any action code.

4. **Why routines return plans instead of executing?** — Testability. You can unit test a routine's output without mocking RPC. The dispatcher handles execution concerns (retry, policy, persistence) uniformly.

5. **Why Bun SQLite for state?** — Zero dependencies, embedded, fast, built into Bun. No external database to manage. Sufficient for single-operator bot deployments.

6. **Why OpenTUI?** — Native Zig core with TypeScript bindings, Bun-native, flexbox layout, high performance. Purpose-built for exactly this kind of operator dashboard.

7. **Why keep `src/brain/` inside `src/`?** — It is part of the shippable agent itself (identity + knowledge), not an external artifact.

8. **Why commit `src/brain/db/` for now?** — Outside/context data is currently treated as versioned knowledge, so the team can track changes and reason from the same baseline across environments.
