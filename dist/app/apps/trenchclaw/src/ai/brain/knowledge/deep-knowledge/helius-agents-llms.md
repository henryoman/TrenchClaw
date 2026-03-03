---
url: https://www.helius.dev/docs/agents/llms.txt
last_updated: 2026-02-23
---

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

Get an API key from https://dashboard.helius.dev or programmatically via the Helius CLI (see below).

## Pages

### Overview
Helius-specific API guidance, recommended workflows, rate limits, credits, error handling, and endpoint quick reference for agents.
https://www.helius.dev/docs/agents/overview.md

### Helius CLI
Programmatic account creation, API key generation, and CLI commands for agents.
https://www.helius.dev/docs/agents/cli.md

### Helius MCP
Connect AI tools to Helius documentation and APIs via Model Context Protocol. Server URL: `https://www.helius.dev/docs/mcp`
https://www.helius.dev/docs/agents/mcp.md

### TypeScript SDK
Complete guide to the Helius TypeScript SDK (`helius-sdk` v2.x). Covers all namespaces: DAS API, RPC V2, Transactions (Smart Transactions and Helius Sender), Enhanced Transactions, Webhooks, WebSockets, Staking, ZK Compression, Wallet API, and programmatic Auth signup. Includes client options, pagination patterns, `tokenAccounts` filter, `changedSinceSlot` incremental fetching, common mistakes, error handling with retries, and full API quick reference for every method.
https://www.helius.dev/docs/agents/typescript-sdk.md

### Rust SDK
Complete guide to the Helius Rust SDK (`helius` crate v1.x, async tokio). Covers all client constructors (Helius::new, new_async, HeliusBuilder, HeliusFactory), DAS API, RPC V2, Smart Transactions, Helius Sender, Enhanced Transactions, Webhooks, Wallet API, Staking, embedded Solana client access, pagination patterns, `token_accounts` filter, `changed_since_slot` incremental fetching, typed error handling with `HeliusError` enum, common mistakes, and full API quick reference for every method.
https://www.helius.dev/docs/agents/rust-sdk.md

## Quick Start: Agent Signup

```bash
npm install -g helius-cli
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
