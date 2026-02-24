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

TrenchClaw is an openclaw-like agentic ai runtime for the Solana blockchain. It's a personal solana assistant that executes modular on-chain actions, runs automated trading routines, and gives operators full visibility and control from the command line.

Built on [`@solana/kit`](https://github.com/anza-xyz/kit) and [`Bun`](https://bun.sh) from the ground up, with GUI/TUI/mobile surfaces planned for 1.0. Zero legacy dependencies. Functional, composable, tree-shakeable. Designed for operators who care about what ships in their binary.

Please give us a star if you're interested in seeing this project get fully built out. It will help me gauge interest. Thank you.

Full architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

## THIS IS VERY UNSAFE AND THERE IS A VERY HIGH CHANCE OF SOMETHING UNEXPECTED HAPPENING IF YOU USE IT. 

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

Solana Kit, Jupiter integration, and Codama-generated clients are all TypeScript-native in this repo. Bun gives fast startup, strong HTTP performance, and native TypeScript execution while keeping the codebase in one language.

---

## What It Does

- Registers and dispatches typed Solana actions with policy gates, retries, and idempotency
- Composes actions into routines: DCA, swing, percentage, and sniper
- Fires routines from triggers: timers, price thresholds, and on-chain events (pool creation, liquidity adds)
- Persists job state, action receipts, and decision logs in Bun SQLite (restart-safe)
- Emits structured events on a typed bus consumed by CLI logs and future alerting
- Exposes an operator control surface through the CLI
- Keeps agent knowledge (soul, rules, skills, outside context) in `src/brain/`, loaded by orchestration in `src/ai/`
- Uses RPC/Jupiter/token-account adapters so the runtime is provider-agnostic (swap Helius for QuickNode without touching action code)
- Generates typed program clients from Anchor IDLs via [Codama](https://github.com/codama-idl/codama) — no hand-rolled instruction builders

---

## v0.1 Checklist (CLI release)

- [x] Runtime core contracts and orchestration foundation
- [x] Action registry + dispatcher + scheduler + event bus
- [x] Bun SQLite state store foundation
- [x] Jupiter Ultra action path (`ultraQuoteSwap`, `ultraExecuteSwap`, `ultraSwap`)
- [x] Runtime settings profiles and policy guardrails
- [ ] Complete remaining priority Solana actions/adapters
- [ ] CLI command surface stabilization for daily operator use
- [ ] Test coverage baseline (unit + integration)
- [ ] Finalize `.env.example` and runtime config defaults
- [ ] npm package publishing
- [ ] Homebrew install flow
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
- [ ] GUI application release
- [ ] Terminal UI (TUI) release
- [ ] Solana Seeker mobile app release
- [ ] Integration test suite
- [ ] End-to-end test suite

---

## License

TBD

# use at your own risk
