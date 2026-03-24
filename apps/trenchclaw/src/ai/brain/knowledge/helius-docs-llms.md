---
url: https://www.helius.dev/docs
last_updated: 2026-02-20
---

# Helius Documentation

The leading Solana RPC and infrastructure platform. Fast, reliable APIs for building on Solana.

## Getting Started

1. Sign up at https://dashboard.helius.dev
2. Get your API key
3. Start building with any of our APIs below

## Getting Started (Agents)

Programmatically create a Helius account and generate an API key.

Guide: https://www.helius.dev/docs/agents/cli.md
Full instructions: https://dashboard.helius.dev/agents.md

### Step 1: Install CLI

Programmatically create accounts and get API keys via CLI:

```bash
bun add -g helius-cli
```

### Step 2: Generate Keypair

```bash
helius keygen
```

Output: Creates keypair at `~/.helius/keypair.json`

Returns: Wallet address to fund

### Step 3: Fund Wallet

Send to the wallet address from Step 2:
- 1 USDC (token: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)
- ~0.001 SOL

### Step 4: Signup and Get API Key

```bash
helius signup --json
```

#### Success Response (exit code 0):

```json
{
  "status": "SUCCESS",
  "wallet": "YourWalletAddress...",
  "projectId": "project-uuid",
  "projectName": "Project Name",
  "apiKey": "your-api-key-here",
  "endpoints": {
    "mainnet": "https://mainnet.helius-rpc.com/?api-key=your-api-key-here",
    "devnet": "https://devnet.helius-rpc.com/?api-key=your-api-key-here"
  },
  "credits": 1000000,
  "transaction": "transaction-signature"
}
```

Extract API key: `response.apiKey`

Extract RPC URL: `response.endpoints.mainnet` or `response.endpoints.devnet`

## Quick Reference

- Mainnet RPC: https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
- Mainnet RPC (Gatekeeper Beta): https://beta.helius-rpc.com/?api-key=YOUR_API_KEY
- Devnet RPC: https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
- Mainnet WSS: wss://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY (Standard and Enhanced WebSockets)
- Mainnet WSS (Gatekeeper Beta): wss://beta.helius-rpc.com/?api-key=YOUR_API_KEY (Standard and Enhanced WebSockets)
- Devnet WSS: wss://devnet.helius-rpc.com/?api-key=YOUR_API_KEY (Standard and Enhanced WebSockets)
- Auth: API key via query parameter (?api-key=YOUR_API_KEY)
- Billing: https://www.helius.dev/docs/billing/llms.txt
- Dashboard: https://dashboard.helius.dev
- Status: https://helius.statuspage.io

## API Documentation

### Solana RPC
Standard Solana JSON-RPC methods with enhanced performance.
https://www.helius.dev/docs/api-reference/rpc/http/llms.txt

### Solana WebSockets (Standard)
Solana WebSocket subscriptions for streaming real-time data. Powered by LaserStream and available on all plans.
https://www.helius.dev/docs/api-reference/rpc/websocket/llms.txt

### Helius Enhanced WebSockets
Powered by LaserStream with advanced filtering and automatic transaction parsing. Available on Business+ plans.
https://www.helius.dev/docs/enhanced-websockets/llms.txt

### Solana DAS API
Unified interface for all Solana digital assets: NFTs, compressed NFTs, fungible tokens.
https://www.helius.dev/docs/api-reference/das/llms.txt

### Solana Enhanced Transactions API
Parsed, human-readable transaction data with automatic labeling.
https://www.helius.dev/docs/api-reference/enhanced-transactions/llms.txt

### Helius LaserStream gRPC
Lowest latency data streaming via gRPC.
https://www.helius.dev/docs/api-reference/laserstream/grpc/llms.txt

### Helius Sender
Lowest latency transaction sending service.
https://www.helius.dev/docs/api-reference/sender/llms.txt

### Helius Shred Delivery
Specialized delivery of raw Solana shreds via UDP.
https://www.helius.dev/docs/shred-delivery/llms.txt

### Helius Priority Fee API
Optimal priority fee estimation for transaction landing.
https://www.helius.dev/docs/api-reference/priority-fee/llms.txt

### Dedicated Nodes
Private Solana nodes with no rate limits, no credits, and full Yellowstone gRPC support.
https://www.helius.dev/docs/dedicated-nodes/llms.txt

### Solana Webhooks
Real-time HTTP POST notifications for blockchain events.
https://www.helius.dev/docs/api-reference/webhooks/llms.txt

### Helius Wallet API
Query Solana wallet balances, transaction history, transfers, identities, and funding sources with structured REST endpoints.
https://www.helius.dev/docs/api-reference/wallet-api/llms.txt

### ZK Compression API
Compressed account and token operations.
https://www.helius.dev/docs/api-reference/zk-compression/llms.txt

### Deprecated APIs

| Deprecated | Use Instead | Reason |
|------------------|-------------|--------|
| `mintCompressedNft` | Use Metaplex Bubblegum SDK directly | Helius mint API is deprecated |
| `queryMetadataV1` | `getAsset` or `searchAssets` (DAS API) | Token Metadata API is deprecated |

## Common Use Cases

| I'm building... | Use these Helius products |
|-----------------|---------------------------|
| Trading bot | Helius Sender (fast tx submission) + Priority Fee API + LaserStream (real-time prices) |
| Wallet app | DAS API (getAssetsByOwner) + getTransactionsForAddress (complete history with token accounts) or Wallet API for REST endpoints|
| NFT marketplace | DAS API (searchAssets, getAssetsByGroup) + Webhooks (track sales/listings) |
| Token launcher | Helius Sender + Priority Fee API + Webhooks (monitor new token) |
| Analytics dashboard** | Enhanced Transactions API + getTransactionsForAddress (historical data) |
| DeFi protocol | LaserStream (real-time account updates) + Helius Sender + Priority Fee API |
| Sniper/MEV bot | LaserStream gRPC (lowest latency) + Helius Sender (staked connections) |
| Portfolio tracker | DAS API (getAssetsByOwner with showFungible) + Enhanced Transactions |
| Airdrop tool | AirShip (95% cheaper with ZK compression) |
| Jupiter/swap integration | Helius RPC + Helius Sender for transaction submission |

## Which API should I use?

| Need | API |
|------|-----|
| Get wallet NFTs and tokens | DAS API |
| Parse transaction history | Enhanced Transactions |
| Real-time event notifications (HTTP) | Webhooks |
| Real-time streaming (WebSocket) | WebSockets |
| Lowest latency streaming | LaserStream gRPC |
| Standard Solana RPC calls | RPC |
| Estimate priority fees | Priority Fee API |
| Work with compressed accounts | ZK Compression |
| Simple REST endpoints for querying Solana wallet data | Wallet API |

## Don't Confuse These

| If you want to... | Use this | NOT this | Why |
|-------------------|----------|----------|-----|
| Get wallet's NFTs and tokens | `getAssetsByOwner` (DAS API) | `getTokenAccountsByOwner` | `getTokenAccountsByOwner` returns raw accounts, not token metadata |
| Get complete transaction history | `getTransactionsForAddress` | `getSignaturesForAddress` | `getTransactionsForAddress` includes token accounts and `getSignaturesForAddress` does not |
| Get transaction history for cNFTs | `getSignaturesForAsset` (DAS API) | `getSignaturesForAddress` | `getSignaturesForAddress` doesn't work for compressed NFTs |
| Stream real-time data (new projects) | LaserStream gRPC | Yellowstone gRPC on dedicated nodes | LaserStream is simpler, provides 24-hour replay, supports auto-reconnects |
| Send transactions reliably | Helius Sender (dual routes to validators + Jito) | Standard `sendTransaction` | sendTransaction uses a single path and has lower landing rates |
| Get priority fee estimates | `getPriorityFeeEstimate` | `getRecentPrioritizationFees` | `getRecentPrioritizationFees` requires manual calculation |
| Search NFTs by collection | DAS API `getAssetsByGroup` or `searchAssets` | `getProgramAccounts` | `getProgramAccounts` is expensive, slow, and data could be unindexed |
| Get real-time data | Enhanced WebSockets or LaserStream gRPC | Polling for real-time data | Polling is inefficient, higher latency, uses credits |

## Key Concepts

| Term | Definition |
|------|------------|
| DAS (Digital Asset Standard) | Standardized API for querying NFTs, tokens, and compressed assets with a unified interface |
| cNFT (Compressed NFT) | NFTs stored in merkle trees instead of individual accounts; 1000x cheaper to mint |
| ZK Compression | Technology to reduce on-chain storage costs by 98% using zero-knowledge proofs |
| Helius Sender | Ultra low latency transaction submission service routing through staked connections (via Solana's largest validator) and Jito simultaneously |
| LaserStream | Helius's managed gRPC streaming service with historical replay and auto-reconnection |
| Yellowstone gRPC | Open-source Solana Geyser plugin for streaming; available on Helius dedicated nodes |
| Priority Fee | Additional fee (in microlamports) to prioritize transaction inclusion in blocks |
| Staked Connections | Direct connections to validators through stake-weighted routing for faster and more reliable transaction landing |
| Associated Token Account (ATA) | The standard token account address derived from a wallet + mint; holds tokens on behalf of wallet |
| Commitment Level | Transaction finality: `processed` (fastest, may revert), `confirmed` (basically final), `finalized` (guaranteed) |

## Guides
- Quickstart: https://www.helius.dev/docs/quickstart.md
- Getting Data: https://www.helius.dev/docs/getting-data.md
- Data Streaming: https://www.helius.dev/docs/data-streaming.md
- Data Streaming quickstart: https://www.helius.dev/docs/data-streaming/quickstart.md
- Authentication: https://www.helius.dev/docs/api-reference/authentication.md
- Endpoints: https://www.helius.dev/docs/api-reference/endpoints.md
- Autoscaling: https://www.helius.dev/docs/billing/autoscaling.md
- Pay with Crypto: https://www.helius.dev/docs/billing/pay-with-crypto.md

## SDKs
Official SDKs that wrap all Helius APIs with type-safe methods and built-in error handling.

- Node.js: https://github.com/helius-labs/helius-sdk
- Rust: https://github.com/helius-labs/helius-rust-sdk
- SDK Overview: https://www.helius.dev/docs/sdks.md
- Rust SDK Docs: https://docs.rs/helius/latest/helius/

## Developer Tools

- Helius MCP: https://www.helius.dev/docs/agents/mcp.md
- Orb Explorer: https://orbmarkets.io
- AirShip: https://www.helius.dev/docs/airship/getting-started.md

## Agents
AI agent documentation, including programmatic signup, API guidance, MCP skills, and SDK usage.
- Agents Index: https://www.helius.dev/docs/agents/llms.txt
- Agents Overview: https://www.helius.dev/docs/agents/overview.md
- Helius CLI: https://www.helius.dev/docs/agents/cli.md
- Helius MCP: https://www.helius.dev/docs/agents/mcp.md
- Build Skill: https://www.helius.dev/docs/agents/skills/build.md
- Phantom Skill: https://www.helius.dev/docs/agents/skills/phantom.md
- DFlow Trading Skill: https://www.helius.dev/docs/agents/skills/dflow.md
- SVM Skill: https://www.helius.dev/docs/agents/skills/svm.md
- Helius Plugin Bundle: https://www.helius.dev/docs/agents/mcp.md
- TypeScript SDK for Agents: https://www.helius.dev/docs/agents/typescript-sdk.md
- Rust SDK for Agents: https://www.helius.dev/docs/agents/rust-sdk.md

## Resources
- Dashboard: https://dashboard.helius.dev
- Status: https://helius.statuspage.io
- Discord: https://discord.com/invite/6GXdee3gBj
- Support: https://dashboard.helius.dev/support
- FAQs: https://www.helius.dev/docs/faqs.md
- Error Codes: https://www.helius.dev/docs/faqs/error-codes.md
