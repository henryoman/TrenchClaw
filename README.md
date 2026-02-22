# TrenchClaw

TrenchClaw is an open claw runtime for the Solana blockchain. It is a terminal-first agent that executes modular on-chain actions, runs automated trading routines, and gives operators full visibility and control from the command line.

Built on [`@solana/kit`](https://github.com/anza-xyz/kit), [`Bun`](https://bun.sh), and [`OpenTUI`](https://opentui.com) from the ground up. Zero legacy dependencies. Functional, composable, tree-shakeable. Designed for operators who care about what ships in their binary.

Coming soon to npm and Homebrew.

Full architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

---

## Why Solana Kit

TrenchClaw does not use [`@solana/web3.js`](https://www.npmjs.com/package/@solana/web3.js) v1. It uses [`@solana/kit`](https://github.com/anza-xyz/kit) (formerly web3.js v2), the official ground-up rewrite from [Anza](https://anza.xyz).

The old `@solana/web3.js` is a monolithic, class-based SDK. Its `Connection` class bundles every RPC method into a single non-tree-shakeable object. Whether you call one method or fifty, your users download the entire library. It relies on third-party crypto polyfills, uses `number` where `bigint` belongs, and provides loose TypeScript types that let bugs slip to runtime.

Kit is the opposite. It is functional, composable, zero-dependency, and fully tree-shakeable. It uses the native [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) for Ed25519 signing instead of userspace polyfills. It uses `bigint` for lamport values. It catches missing blockhashes, missing signers, and wrong account types at compile time, not after your transaction fails on-chain.

### The numbers

| | `@solana/web3.js` v1 | `@solana/kit` v6 |
|---|---|---|
| Architecture | Monolithic `Connection` class | 28 modular packages |
| Bundle (minified) | ~450 KB | ~100 KB compressed |
| Tree-shakeable | No | Yes |
| Dependencies | Multiple (bn.js, borsh, buffer, etc.) | Zero |
| Crypto | Userspace polyfills | Native Web Crypto API (Ed25519) |
| Large numbers | `number` (lossy above 2^53) | `bigint` (safe for lamports) |
| Type safety | Loose | Strict (compile-time signer/blockhash/account checks) |
| Confirmation latency | Baseline | ~200ms faster in real-world testing |
| Maintenance | Security patches only | Active development by Anza |

Real-world impact: the [Solana Explorer](https://explorer.solana.com) homepage dropped its bundle from 311 KB to 226 KB (a **26% reduction**) after migrating to Kit.

### What changes in practice

**No more `Connection` class.** Kit replaces it with `createSolanaRpc()` and `createSolanaRpcSubscriptions()` — lightweight proxy objects that only bundle the methods you actually call. Whether your RPC supports 1 method or 100, the bundle size stays the same.

**No more `Keypair`.** Kit uses `CryptoKeyPair` from the Web Crypto API via `generateKeyPairSigner()`. Private keys never have to be exposed to the JavaScript environment. Signing happens through `TransactionSigner` objects that abstract the mechanism — hardware wallet, browser extension, CryptoKey, or noop signer for testing.

**No more mutable transactions.** Kit uses a functional `pipe()` pattern to build transaction messages. Each step returns a new immutable object with an updated TypeScript type, so the compiler tracks what your transaction has (fee payer, blockhash, instructions, signers) and what it's missing — before you ever hit the network.

```typescript
import { pipe, createTransactionMessage, setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions,
  signTransactionMessageWithSigners } from '@solana/kit';

const tx = pipe(
  createTransactionMessage({ version: 0 }),
  (tx) => setTransactionMessageFeePayerSigner(payer, tx),
  (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
  (tx) => appendTransactionMessageInstructions([transferInstruction], tx),
);

const signed = await signTransactionMessageWithSigners(tx);
```

**No more hand-rolled instruction builders.** Program interactions use generated clients from [Codama](https://github.com/codama-idl/codama) IDL files. Drop an IDL JSON in `lib/client/idl/`, run codegen, get typed instruction builders, account decoders, PDA helpers, and error enums. TrenchClaw imports from these generated clients — never constructs instructions manually.

**Incremental migration path.** Kit provides [`@solana/compat`](https://solana.com/docs/frontend/web3-compat) for converting between legacy and Kit types (`fromLegacyPublicKey`, `fromVersionedTransaction`, etc.), so existing code can be migrated progressively.

### Modular imports

TrenchClaw imports from Kit sub-packages directly:

- [`@solana/rpc`](https://www.npmjs.com/package/@solana/rpc) — RPC client creation and request building
- [`@solana/signers`](https://www.npmjs.com/package/@solana/signers) — Transaction and message signing abstractions
- [`@solana/transactions`](https://www.npmjs.com/package/@solana/transactions) — Transaction compilation and serialization
- [`@solana/addresses`](https://www.npmjs.com/package/@solana/addresses) — Address creation and validation
- [`@solana/codecs`](https://www.npmjs.com/package/@solana/codecs) — Composable serialization for account data
- [`@solana/accounts`](https://www.npmjs.com/package/@solana/accounts) — Account fetching and decoding helpers
- [`@solana/errors`](https://www.npmjs.com/package/@solana/errors) — Typed error handling

This means TrenchClaw only ships the Kit code it actually uses. No dead code. No bloat.

---

## Why TypeScript on Bun

The "just use Rust" argument comes up constantly in Solana. Here is an honest take.

**Rust is faster for latency-critical execution.** If you are building a same-block copy-trading bot that needs p99 under 100ms from signal to on-chain inclusion, Rust is the right choice. Geyser gRPC in Rust is ~200ms faster than Node.js equivalents. For HFT and competitive MEV, Rust wins.

**But most Solana automation is not HFT.** DCA buys every 30 minutes. Swing trades on a 4-hour cycle. Percentage rebalances once a day. Sniper entries where the bottleneck is pool detection, not instruction serialization. For these workloads, the runtime language is not the bottleneck — RPC latency, network propagation, and Jupiter routing are.

**TypeScript on Bun is genuinely fast.** Bun is not Node.js. It runs on [JavaScriptCore](https://developer.apple.com/documentation/javascriptcore) (Safari's engine), written in Zig, optimized for fast startup and low memory. It executes TypeScript natively with zero build step.

| | Node.js 22 | Bun 1.2 |
|---|---|---|
| Cold start | 60–120ms | 15–30ms |
| HTTP throughput | ~68K req/s (Fastify) | ~245K req/s (Bun.serve) |
| SQLite operations | ~12ms (external dep) | ~3ms (built-in native) |
| CPU-bound tasks | ~3,400ms (sort benchmark) | ~1,700ms (same benchmark) |
| Package install | 30–45s (npm) | 2–3s |
| TypeScript | Requires transpilation | Native execution |

Bun's native SQLite is what TrenchClaw uses for persistent state: job queues, action receipts, policy hits, decision logs. No external database. No ORM. 4x faster than Node.js SQLite alternatives, built into the runtime.

**The real argument for TypeScript is development velocity and ecosystem reach.** Solana Kit, Jupiter API, Metaplex, Anchor client generation (Codama), OpenTUI — all TypeScript-native. The entire operator-facing stack (TUI, CLI, config parsing, event bus) is TypeScript. Rewriting that in Rust buys you nothing when the hot path is a network call to Jupiter that takes 200ms regardless of your language.

**TrenchClaw's position:** use TypeScript where it makes sense (orchestration, UI, config, adapters, action dispatch) and leave the door open for Rust where it matters (future: custom on-chain programs, latency-critical triggers). The adapter architecture means a Rust-based RPC client or signing module can slot in without rewriting the runtime.

---

## Why OpenTUI

[OpenTUI](https://opentui.com) is a terminal UI framework with a native rendering core written in Zig and TypeScript bindings. It powers [OpenCode](https://opencode.ai) in production. It is the only terminal UI framework built for Bun from the start.

| | [Ink](https://www.npmjs.com/package/ink) | [Blessed](https://www.npmjs.com/package/neo-blessed) | [OpenTUI](https://opentui.com) |
|---|---|---|---|
| Core | JavaScript (React reconciler) | JavaScript | Zig + TypeScript |
| Layout | Yoga (flexbox) | Custom widget system | Native flexbox |
| Rendering | React render cycle | Direct terminal writes | Native renderer (30–60 FPS configurable) |
| Syntax highlighting | No | No | Yes ([tree-sitter](https://tree-sitter.github.io/tree-sitter/)) |
| Animations | No | No | Yes (Timeline API) |
| Framework bindings | React only | None | React and [SolidJS](https://www.solidjs.com/) |
| Bun-native | No | No | Yes (`bun create tui`) |
| GitHub stars | ~27K | ~11K | ~8.8K |

Ink requires React. Blessed is unmaintained. OpenTUI gives TrenchClaw a high-performance operator dashboard — live action feeds, bot status, keyboard-driven controls, emergency stop — without pulling in a frontend framework or a widget library from 2015.

---

## What It Does

- Registers and dispatches typed Solana actions with policy gates, retries, and idempotency
- Composes actions into routines: DCA, swing, percentage, and sniper
- Fires routines from triggers: timers, price thresholds, and on-chain events (pool creation, liquidity adds)
- Persists job state, action receipts, and decision logs in Bun SQLite (restart-safe)
- Emits structured events on a typed bus consumed by the TUI, logs, and future alerting
- Exposes a full operator control plane: overview, bot management, live action feed, emergency stop
- Keeps agent knowledge (soul, rules, skills, outside context) in `src/brain/`, loaded by orchestration in `src/ai/`
- Uses RPC/Jupiter/token-account adapters so the runtime is provider-agnostic (swap Helius for QuickNode without touching action code)
- Generates typed program clients from Anchor IDLs via [Codama](https://github.com/codama-idl/codama) — no hand-rolled instruction builders

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
