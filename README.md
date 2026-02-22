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

- [x] Repo scaffolding refactor
- [ ] Finish runtime folder setup
- [ ] Finish action registry
- [ ] Finish dispatcher
- [ ] Finish RPC adapter
- [ ] Finish Jupiter adapter
- [ ] Finish token-account adapter
- [ ] Implement `checkSolBalance`
- [ ] Implement `checkBalance`
- [ ] Implement `getWalletState`
- [ ] Implement `quoteSwap`
- [ ] Implement `executeSwap`
- [ ] Implement DCA routine
- [ ] Implement swing routine
- [ ] Implement percentage routine
- [ ] Implement sniper routine
- [ ] Implement timer trigger
- [ ] Implement price trigger
- [ ] Implement on-chain trigger
- [ ] Finish OpenTUI overview view
- [ ] Finish OpenTUI bots view
- [ ] Finish OpenTUI action-feed view
- [ ] Finish OpenTUI controls view
- [ ] Finish state-store jobs table
- [ ] Finish state-store receipts table
- [ ] Finalize `.env.example`
- [ ] First alpha release

## v1.0 Checklist

- [ ] Finish production action lifecycle
- [ ] Finish full policy engine
- [ ] Implement simulation mode
- [ ] Implement paper-trading mode
- [ ] Finish RPC failover hardening
- [ ] Finish observability wiring
- [ ] Finish structured logging
- [ ] Finish decision trace logging
- [ ] Finish operator alerts
- [ ] Implement multi-wallet support
- [ ] Finish bot profile deployment flow
- [ ] Finish OpenTUI incident workflows
- [ ] Add integration tests
- [ ] Add e2e tests
- [ ] npm package publishing
- [ ] Homebrew install flow

---

## License

TBD
