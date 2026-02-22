# TrenchClaw

TrenchClaw is an open claw runtime for the Solana blockchain. It is a terminal-first agent that executes modular on-chain actions, runs automated trading routines, and gives operators full visibility and control from the command line.

Built on [Bun](https://bun.sh), [OpenTUI](https://opentui.com), and [Solana Kit](https://github.com/anza-xyz/kit) from the ground up. No legacy dependencies. No bloat. Just fast, composable Solana automation.

Coming soon to npm and Homebrew.

Full architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

---

## Why These Primitives

TrenchClaw is built exclusively on the modern Solana stack. Every dependency choice is intentional.

### Solana Kit over `@solana/web3.js`

The legacy [`@solana/web3.js`](https://www.npmjs.com/package/@solana/web3.js) v1 is a monolithic, class-based SDK that ships ~450KB minified, cannot be tree-shaken, and forces you to bundle every RPC method whether you use it or not.

[`@solana/kit`](https://github.com/anza-xyz/kit) is the official replacement from Anza. It is modular, functional, fully tree-shakeable, and built for modern TypeScript.

| | `@solana/web3.js` v1 | `@solana/kit` v6 |
|---|---|---|
| Architecture | Monolithic `Connection` class | 28 modular packages |
| Bundle (minified) | ~450 KB | ~100 KB compressed |
| Tree-shakeable | No | Yes |
| Confirmation latency | Baseline | ~200ms faster |
| TypeScript safety | Loose | Strict (compile-time checks for blockhash, signers, accounts) |
| Maintenance | Security patches only | Active development by Anza |

Real-world impact: the Solana Explorer homepage dropped **26%** off its bundle (311 KB to 226 KB) after migrating to Kit.

TrenchClaw imports from modular Kit packages directly (`@solana/rpc`, `@solana/signers`, `@solana/transactions`, `@solana/addresses`, `@solana/codecs`) and uses generated IDL clients from `lib/client/idl/` for program-specific interactions. No hand-rolled instruction builders.

### Bun over Node.js

[Bun](https://bun.sh) is the runtime. Not Node. Not Deno.

| | Node.js 22 | Bun 1.2 |
|---|---|---|
| Cold start | 60-120ms | 15-30ms |
| HTTP throughput | ~68K req/s | ~245K req/s |
| SQLite (built-in) | No (needs dependency) | Yes (native, ~4x faster) |
| Package install | 30-45s | 2-3s |
| TypeScript | Requires transpilation | Native execution |

TrenchClaw uses Bun's native SQLite for persistent state (job queue, action receipts, decision logs) and native TypeScript execution with zero build step.

### OpenTUI over Ink / Blessed

[OpenTUI](https://opentui.com) is a terminal UI framework with a native rendering core written in Zig and TypeScript bindings on top. It powers [OpenCode](https://opencode.ai) in production.

| | Ink | Blessed / neo-blessed | OpenTUI |
|---|---|---|---|
| Core language | JavaScript | JavaScript | Zig + TypeScript |
| Layout engine | Yoga (flexbox) | Custom widgets | Native flexbox |
| Rendering | React reconciler | Direct terminal writes | Native renderer (30-60 FPS) |
| Syntax highlighting | No | No | Yes (tree-sitter) |
| Bun-native | No | No | Yes (`bun create tui`) |
| Animations | No | No | Yes (Timeline API) |

OpenTUI gives TrenchClaw a high-performance operator dashboard with live action feeds, bot status views, and keyboard-driven controls without pulling in React or a widget library.

---

## What It Does

- Registers and dispatches typed Solana actions with policy gates, retries, and idempotency
- Composes actions into routines: DCA, swing, percentage, and sniper
- Fires routines from triggers: timers, price thresholds, and on-chain events (pool creation, liquidity adds)
- Persists job state, action receipts, and decision logs in Bun SQLite (restart-safe)
- Emits structured events on a typed bus consumed by the TUI, logs, and future alerting
- Exposes a full operator control plane: overview, bot management, action feed, emergency stop
- Keeps agent knowledge (soul, rules, skills, outside context) in `src/brain/`, loaded by the orchestration layer in `src/ai/`
- Uses RPC/Jupiter/token-account adapters so the runtime is provider-agnostic (swap Helius for QuickNode without touching action code)

---

## v0.1 Checklist

- [ ] Stable runtime layout (`src/ai`, `src/brain`, `src/solana`, `src/app/cli`, `src/types`)
- [ ] Action contracts and dispatcher lifecycle wired end-to-end
- [ ] RPC/Jupiter/token-account adapters wired with shared context
- [ ] Core actions implemented (`checkSolBalance`, `checkBalance`, `getWalletState`, `quoteSwap`, `executeSwap`)
- [ ] Core routines implemented (DCA, swing, percentage, sniper)
- [ ] Core triggers implemented (timer, price, on-chain)
- [ ] OpenTUI views wired (overview, bots, action feed, controls)
- [ ] Persistent state store wired for jobs and receipts
- [ ] `.env.example` finalized for first public alpha
- [ ] First alpha release

## v1.0 Checklist

- [ ] Production-safe action lifecycle with idempotency, retries, and timeouts
- [ ] Full policy engine (allowlists, caps, slippage, cooldowns, circuit breakers)
- [ ] Deterministic simulation and paper-trading mode
- [ ] Robust RPC failover with health scoring and observability
- [ ] Structured logs, decision traces, and operator alerts
- [ ] Multi-wallet support and deployable bot profiles
- [ ] Complete OpenTUI control plane with incident workflows
- [ ] Integration and e2e test coverage for trade lifecycle and recovery
- [ ] npm package publishing
- [ ] Homebrew install flow

---

## License

TBD
