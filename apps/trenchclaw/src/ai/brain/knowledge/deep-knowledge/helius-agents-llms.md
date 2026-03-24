---
url: https://www.helius.dev/docs/agents/llms.txt
last_updated: 2026-03-03
---

<!-- markdownlint-disable MD022 MD031 MD034 MD060 -->

# Helius Agents Documentation

Machine-readable index of all agent-focused documentation for the Helius Solana platform.

## Authentication

All Helius API requests require an API key passed as a query parameter: `?api-key=YOUR_API_KEY`

- Mainnet RPC: `https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY`
- Mainnet RPC (Gatekeeper Beta — lower latency): `https://beta.helius-rpc.com/?api-key=YOUR_API_KEY`
- Devnet RPC: `https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY`
- Mainnet WSS: `wss://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY`
- Mainnet WSS (Gatekeeper Beta): `wss://beta.helius-rpc.com/?api-key=YOUR_API_KEY`
- Sender: `https://sender.helius-rpc.com/fast`

Get an API key from https://dashboard.helius.dev or programmatically via the Helius MCP server or CLI (see below).

## Recommended: Use MCP (Not CLI) for AI Agents

The Helius MCP server is the recommended way for AI agents to interact with Helius. It provides 60+ tools with structured inputs/outputs — the AI calls tools directly rather than spawning shell commands and parsing output. Use the CLI only for shell scripts, CI/CD, or when MCP is not available.

- MCP: Structured tool calls, built-in signup (`generateKeypair` → `agenticSignup`), works with Codex, Cursor, VS Code, ChatGPT, Windsurf, and any MCP-compatible tool
- CLI: Shell commands with `--json` output, for terminal workflows and automation scripts

## Pages

### Overview
Helius-specific API guidance, recommended workflows, rate limits, credits, error handling, and endpoint quick reference for agents. Includes MCP vs CLI comparison.
https://www.helius.dev/docs/agents/overview.md

### Helius CLI
Full-featured CLI for Helius (95+ commands). Best for shell scripts, CI/CD pipelines, and terminal workflows. For AI agents, prefer the MCP server instead. Supports plan selection (Agent $1, Developer $49, Business $499, Professional $999). JSON output for every command.
https://www.helius.dev/docs/agents/cli.md

### CLI Command Reference
Full reference for all 95+ Helius CLI commands organized by category: account management, projects, config, balance/tokens, transactions, DAS API, wallet, webhooks, transaction sending, WebSockets, program accounts, staking, ZK compression, account/network, and SIMDs.
https://www.helius.dev/docs/agents/cli/commands.md

### Helius MCP
MCP server for Helius (`helius-mcp` package). 60+ tools for querying the blockchain, sending transactions, managing webhooks, streaming data, wallet analysis, and autonomous account signup. Install by adding an MCP server named `helius` that runs `bunx helius-mcp@latest`.
https://www.helius.dev/docs/agents/mcp.md

### MCP Tool Catalog
Full catalog of 60+ tools available in the Helius MCP server organized by category: onboarding, DAS API, RPC & network, transactions, transfers, priority fees, webhooks, Enhanced WebSockets, LaserStream gRPC, wallet, plans & billing, Solana knowledge, and docs & guides.
https://www.helius.dev/docs/agents/mcp/tools.md

### Skills Overview
Model-agnostic instruction sets that teach AI assistants how to build on Solana using Helius. Skills provide routing logic, correct SDK patterns, deep reference files, and rules that prevent common mistakes. Each skill ships with pre-built system prompt variants for OpenAI API, Codex CLI, Cursor, and ChatGPT. Four skills available: Build (general Solana dev), Phantom (frontend dApps), DFlow (trading apps), SVM (protocol internals).
https://www.helius.dev/docs/agents/skills/overview.md

### Build Skill
Core Helius skill. Makes your AI assistant an expert Solana developer with routing to the right MCP tools and reference files for DAS API, Sender, WebSockets, LaserStream, Webhooks, Wallet API, Enhanced Transactions, onboarding, and Solana knowledge. Requires `helius-mcp`. Plugin command: `/helius:build` where supported. Codex: `$helius`. API/Cursor: use `prompts/openai.developer.md` or `full.md`.
https://www.helius.dev/docs/agents/skills/build.md

### Phantom Skill
Frontend dApp skill combining Phantom Connect SDK (React, React Native, browser) with Helius infrastructure. Covers wallet connection, transaction signing, token gating, NFT minting, crypto payments, portfolio display, real-time updates, and secure frontend architecture. Requires `helius-mcp`. Plugin command: `/helius:phantom` where supported. Codex: `$helius-phantom`. API/Cursor: use pre-built system prompt variants.
https://www.helius.dev/docs/agents/skills/phantom.md

### DFlow Trading Skill
Trading skill combining DFlow APIs (spot swaps, prediction markets, real-time streaming, Proof KYC) with Helius infrastructure (Sender, priority fees, DAS, WebSockets, LaserStream, Wallet API). Requires `helius-mcp` + DFlow MCP. Plugin command: `/helius:dflow` where supported. Codex: `$helius-dflow`. API/Cursor: use pre-built system prompt variants.
https://www.helius.dev/docs/agents/skills/dflow.md

### SVM Skill
Solana protocol expert skill. Explains SVM execution engine, account model, consensus (PoH, Tower BFT, Turbine), transactions and fee markets, validator economics, data layer, program development, and token extensions. Uses Helius blog, SIMDs, and Agave/Firedancer source code via MCP tools. No API key required. Plugin command: `/helius:svm` where supported. Codex: `$svm`. API/Cursor: use pre-built system prompt variants.
https://www.helius.dev/docs/agents/skills/svm.md

### Helius Plugin Bundle
All-in-one Helius plugin bundle. Bundles the Helius MCP server (auto-starts `helius-mcp@latest`), DFlow MCP server (auto-starts `pond.dflow.net/mcp`), Build skill (`/helius:build`), Phantom skill (`/helius:phantom`), DFlow skill (`/helius:dflow`), and SVM skill (`/helius:svm`) with deep reference files.

### TypeScript SDK
Overview of the Helius TypeScript SDK (`helius-sdk` v2.x). Installation, quick start, client options, namespaces, and programmatic Auth signup.
https://www.helius.dev/docs/agents/typescript-sdk.md

### TypeScript SDK Best Practices
Recommended patterns for agents: transaction history (`getTransactionsForAddress`), sending transactions (`sendSmartTransaction`, Helius Sender), batching, real-time data (webhooks, WebSockets), pagination (token/cursor-based and page-based), `tokenAccounts` filter, `changedSinceSlot` incremental fetching, common mistakes, and error handling with retries.
https://www.helius.dev/docs/agents/typescript-sdk/best-practices.md

### TypeScript SDK API Reference
Full method list for every namespace: DAS API, RPC V2, Transactions, Enhanced Transactions, Webhooks, WebSockets, Staking, Wallet API, ZK Compression, and Standard Solana RPC.
https://www.helius.dev/docs/agents/typescript-sdk/api-reference.md

### Rust SDK
Overview of the Helius Rust SDK (`helius` crate v1.x, async tokio). Installation, quick start, and all client constructors (Helius::new, new_async, HeliusBuilder, HeliusFactory).
https://www.helius.dev/docs/agents/rust-sdk.md

### Rust SDK Best Practices
Recommended patterns for agents: transaction history (`get_transactions_for_address`), sending transactions (`send_smart_transaction`, Helius Sender), batching, webhooks, pagination (token/cursor-based and page-based), `token_accounts` filter, `changed_since_slot` incremental fetching, common mistakes, and typed error handling with `HeliusError` enum and retries.
https://www.helius.dev/docs/agents/rust-sdk/best-practices.md

### Rust SDK API Reference
Full method list for every category: DAS API, RPC V2, Smart Transactions, Helius Sender, Enhanced Transactions, Webhooks, Wallet API, Staking, and Embedded Solana Client.
https://www.helius.dev/docs/agents/rust-sdk/api-reference.md

## Quick Start: Agent Signup

```bash
bun add -g helius-cli
helius keygen
# Fund wallet: 1 USDC + ~0.001 SOL
helius signup --json
```

Success response:
```json
{
  "status": "SUCCESS",
  "apiKey": "your-api-key-here",
  "endpoints": {
    "mainnet": "https://mainnet.helius-rpc.com/?api-key=your-api-key-here",
    "devnet": "https://devnet.helius-rpc.com/?api-key=your-api-key-here"
  },
  "credits": 1000000
}
```

Or use the TypeScript SDK auth module for in-process signup (no CLI needed):

```typescript
import { makeAuthClient } from "helius-sdk/auth/client";
const auth = makeAuthClient();
const result = await auth.agenticSignup({ secretKey: keypair.secretKey });
// result: { jwt, walletAddress, projectId, apiKey, endpoints, credits }
```

## Use Helius APIs Instead Of Standard Solana RPC

| Instead of... | Use this | Why |
|---------------|----------|-----|
| `getSignaturesForAddress` + `getTransaction` | `getTransactionsForAddress` | Single call with server-side filtering and token account support |
| `getTokenAccountsByOwner` | `getAssetsByOwner` (DAS API) | Returns rich metadata, not just raw accounts |
| `getRecentPrioritizationFees` | `getPriorityFeeEstimate` | Pre-calculated optimal fees |
| `getProgramAccounts` (for NFT search) | `searchAssets` or `getAssetsByGroup` (DAS API) | Faster, cheaper, indexed data |
| Polling for real-time data | Enhanced WebSockets or LaserStream gRPC | Lower latency, more efficient |
| Standard `sendTransaction` | Helius Sender | Dual routing (validators + Jito), higher landing rates |

## Related Resources

- Full documentation: https://www.helius.dev/docs
- LLM-optimized docs: https://www.helius.dev/docs/llms.txt
- API reference: https://www.helius.dev/docs/api-reference
- Billing and credits: https://www.helius.dev/docs/billing/credits.md
- Rate limits: https://www.helius.dev/docs/billing/rate-limits.md
- Dashboard: https://dashboard.helius.dev
- Status: https://helius.statuspage.io
- Full agent signup instructions: https://dashboard.helius.dev/agents.md

---
Full documentation index: https://www.helius.dev/docs/llms.txt
