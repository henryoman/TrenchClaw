<p align="center">
  <img src="./public/trenchclaw.png" alt="TrenchClaw" width="320" />
</p>

<p align="center">
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white" alt="Bun" /></a>
  <a href="https://github.com/anza-xyz/kit"><img src="https://img.shields.io/badge/Solana%20Kit-551BF9?style=for-the-badge&logo=solana&logoColor=white" alt="Solana Kit" /></a>
  <a href="https://umi.typedoc.metaplex.com"><img src="https://img.shields.io/badge/Umi-2E2E2E?style=for-the-badge&logo=metaplex&logoColor=white" alt="Umi" /></a>
  <a href="https://www.metaplex.com"><img src="https://img.shields.io/badge/Metaplex-6A00FF?style=for-the-badge&logo=metaplex&logoColor=white" alt="Metaplex" /></a>
  <a href="https://www.jup.ag"><img src="https://img.shields.io/badge/Jupiter-00BFA6?style=for-the-badge&logo=jupiter&logoColor=white" alt="Jupiter" /></a>
  <a href="https://www.helius.dev"><img src="https://img.shields.io/badge/Helius-FF6B35?style=for-the-badge&logo=helius&logoColor=white" alt="Helius" /></a>
  <a href="https://solana.com"><img src="https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white" alt="Solana" /></a>
</p>

# TrenchClaw

TrenchClaw is an open claw runtime for the Solana blockchain. It is a terminal-first agent that executes modular on-chain actions, runs automated trading routines, and gives operators full visibility and control from the command line.

Built on [`@solana/kit`](https://github.com/anza-xyz/kit), [`Bun`](https://bun.sh), and [`OpenTUI`](https://opentui.com) from the ground up. Zero legacy dependencies. Functional, composable, tree-shakeable. Designed for operators who care about what ships in their binary.

Coming soon to npm and Homebrew. Please give us a star if you're interested in seeing this project get fully built out. It will help me gauge interest. Thank you.

Full architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

This bot is extremely unsafe and there is a very high chance something unexpected will happen if you use it.

## We ship every day

### Monday 2/23 deliverables

- GUI repo setup
- Finish Jupiter ultra actions and test
- Finish building current data fetching methods and test
- Update test coverage in general across the whole repo
- Finish default user-facing YAML config surface
- Decouple TUI frontend so frontend can be agnostic as we build more of them

### Tuesday deliverables

- Setup structure for GitHub releases and CI pipeline
- Setup Codama IDL and client generation foundation
- Add the rest of the actions

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

## TrenchClaw vs ElizaOS and Agent Kit

If you are evaluating Solana agent stacks today, the practical split is this: TrenchClaw is built directly on `@solana/kit`, while many existing agent ecosystems still rely on legacy `@solana/web3.js` integrations.

| | TrenchClaw | ElizaOS (typical Solana plugin setups) | Agent Kit style starter stacks |
|---|---|---|---|
| Primary Solana SDK | `@solana/kit` | Commonly `@solana/web3.js`-based plugins/adapters | Commonly `@solana/web3.js` wrappers |
| API style | Functional + composable | Framework/plugin driven | Framework/toolkit driven |
| Tree-shaking | Strong (modular Kit packages) | Often weaker due to `Connection`-style clients | Often weaker due to broad utility bundles |
| Type guarantees around tx composition | Strong compile-time checks in Kit pipeline | Depends on plugin quality | Depends on toolkit layer |
| Runtime focus | Terminal-first operator runtime | Multi-platform agent framework | General AI-agent developer UX |

Why this matters:

- `@solana/web3.js` v1 is in maintenance mode, while `@solana/kit` is the actively developed path forward from Anza.
- Legacy web3.js-heavy integrations usually carry more historical baggage (polyfills, looser typing, larger utility surfaces).
- TrenchClaw is optimized for production operator workflows (actions, routines, triggers, policies, and control-plane UX), not generic chatbot abstractions first.

**Bottom line:** if you want a Solana-native operator runtime with modern SDK foundations, TrenchClaw is purpose-built for that. If you want a broad agent framework with Solana as one plugin among many, ElizaOS/Agent Kit can fit — but the Solana layer is frequently still tied to older web3.js assumptions.

### Cross-framework context (same benchmark source)

| Framework/runtime | Throughput (req/s) |
|---|---:|
| Rust + Axum | 21,030 |
| Bun + Fastify | 20,683 |
| ASP.NET Core | 14,707 |
| Go + Gin | 3,546 |
| Python + FastAPI (Uvicorn) | 1,185 |

### Storage: Bun SQLite

TrenchClaw uses Bun's built-in SQLite (`bun:sqlite`) for job queues, action receipts, policy hits, and decision logs. It keeps state local, restart-safe, and dependency-light.

[Bun's SQLite docs](https://bun.com/docs/runtime/sqlite) show strong wins on many read/materialization workloads versus common JS drivers, but complex `JOIN`/aggregation workloads vary by query shape. So the rule is simple: use Bun SQLite by default, benchmark real production queries before making hard guarantees.

### Why this stack here

Solana Kit, Jupiter integration, Codama-generated clients, and the operator TUI ([OpenTUI](https://opentui.com)) are all TypeScript-native in this repo. Bun gives fast startup, strong HTTP performance, and native TypeScript execution while keeping the codebase in one language.

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

## v0.1 Checklist (current repo status)

### Core foundation

- [x] Monorepo scaffolding and module layout refactor
- [x] Runtime core contracts + `src/ai/core` foundation
- [x] Action registry implementation
- [x] Dispatcher implementation (policy hooks, retries, idempotency receipts)
- [x] Scheduler skeleton wired to dispatcher/state store
- [x] Event bus implementation
- [x] In-memory state store implementation (jobs/receipts/policy hits/decision logs)

### Actions and adapters

- [x] Data action surface split into `rpc/` and `api/`
- [x] Dexscreener API action implementation
- [x] Jupiter Ultra adapter implementation
- [x] Jupiter Ultra swap actions (`ultraQuoteSwap`, `ultraExecuteSwap`)
- [ ] Core RPC pool adapter implementation (current file is still spec/stub)
- [ ] Standard Jupiter adapter implementation (current file is still spec/stub)
- [ ] Token-account adapter implementation (current file is still spec/stub)
- [ ] Read-only wallet actions (`checkSolBalance`, `checkBalance`, `getWalletState`) implementation
- [ ] RPC swap actions (`quoteSwap`, `executeSwap`) implementation

### Routines, triggers, and operator surfaces

- [ ] DCA routine implementation (currently spec-only)
- [ ] Swing routine implementation (currently spec-only)
- [ ] Percentage routine implementation (currently spec-only)
- [ ] Sniper routine implementation (currently spec-only)
- [ ] Timer trigger implementation (currently spec-only)
- [ ] Price trigger implementation (currently spec-only)
- [ ] On-chain trigger implementation (currently spec-only)
- [ ] OpenTUI `overview` view implementation
- [ ] OpenTUI `bots` view implementation
- [ ] OpenTUI `action-feed` view implementation
- [ ] OpenTUI `controls` view implementation
- [x] Web GUI app scaffold (`apps/web-gui`)

### Quality and release readiness

- [ ] SQLite-backed state store tables (`jobs`, `receipts`) implementation
- [ ] Test coverage baseline (unit + integration)
- [ ] Finalize `.env.example` (remove duplicates + align key names)
- [ ] First alpha release

## v1.0 Checklist

- [ ] Production-grade action lifecycle hardening
- [ ] Full policy engine (composable policy packs + richer post-trade checks)
- [ ] Simulation mode
- [ ] Paper-trading mode
- [ ] RPC failover hardening (health scoring + endpoint strategy)
- [ ] Observability wiring (metrics + traces)
- [ ] Structured logging rollout
- [ ] Decision trace logging UX
- [ ] Operator alerting pipeline
- [ ] Multi-wallet support
- [ ] Bot profile deployment flow
- [ ] OpenTUI incident workflows
- [ ] Integration test suite
- [ ] End-to-end test suite
- [ ] npm package publishing
- [ ] Homebrew install flow

---

## License

TBD
