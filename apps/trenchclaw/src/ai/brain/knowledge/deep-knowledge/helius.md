# Helius Deep Reference: Agents, APIs, and Runtime Patterns

Last verified: 2026-03-03

This deep document is the long-form Helius reference for TrenchClaw.
The top-level quick file is `src/ai/brain/knowledge/helius-agents.md`.

## Primary Sources

- Helius CLI agent instructions: https://dashboard.helius.dev/agents.md
- Full docs index: https://www.helius.dev/docs/llms.txt
- Agents docs index: https://www.helius.dev/docs/agents/llms.txt
- Helius CLI repo: https://github.com/helius-labs/helius-cli

## Documentation Discovery Indexes

Use these before exploring any specific page:

- Global index: https://www.helius.dev/docs/llms.txt
- Agents index: https://www.helius.dev/docs/agents/llms.txt
- Local mirror of agents index: `src/ai/brain/knowledge/deep-knowledge/helius-agents-llms.md`
- Local mirror of full docs index: `src/ai/brain/knowledge/deep-knowledge/helius-docs-llms-full.md`

Agent-focused pages:

- Overview: https://www.helius.dev/docs/agents/overview.md
- CLI: https://www.helius.dev/docs/agents/cli.md
- MCP: https://www.helius.dev/docs/agents/mcp.md
- TypeScript SDK: https://www.helius.dev/docs/agents/typescript-sdk.md
- Rust SDK: https://www.helius.dev/docs/agents/rust-sdk.md

## Helius CLI: Full Agent Signup Flow

### Requirements

- Node.js 18+
- Funded Solana mainnet wallet:
  - 1 USDC
  - ~0.001 SOL tx fees

### Flow

1. Install CLI:

```bash
npm install -g helius-cli
```

2. Generate keypair:

```bash
helius keygen
```

Creates keypair at `~/.helius-cli/keypair.json`.

3. Fund wallet:

- 1 USDC mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- ~0.001 SOL

4. Signup:

```bash
helius signup --json
```

Success shape:

```json
{
  "status": "SUCCESS",
  "wallet": "YourWalletAddress...",
  "projectId": "project-uuid",
  "projectName": "Project Name",
  "apiKey": "your-api-key-here",
  "endpoints": {
    "mainnet": "https://beta.helius-rpc.com/?api-key=your-api-key-here",
    "devnet": "https://devnet.helius-rpc.com/?api-key=your-api-key-here"
  },
  "credits": 1000000,
  "transaction": "transaction-signature"
}
```

Extract values:

- API key: `response.apiKey`
- Mainnet RPC (use gateway URL for lower-friction routing): `response.endpoints.mainnet`
- Devnet RPC: `response.endpoints.devnet`

### Existing Account Behavior

`helius signup --json` is idempotent for existing accounts and can return:

```json
{
  "status": "EXISTING_PROJECT",
  "wallet": "YourWalletAddress...",
  "projectId": "existing-project-uuid",
  "projectName": "Existing Project",
  "apiKey": "existing-api-key",
  "endpoints": {
    "mainnet": "https://beta.helius-rpc.com/?api-key=existing-api-key",
    "devnet": "https://devnet.helius-rpc.com/?api-key=existing-api-key"
  },
  "credits": 950000
}
```

Existing wallet login path:

```bash
helius login --keypair /path/to/keypair.json --json
helius apikeys --json
```

### CLI Command Reference

- `helius --version`
- `helius keygen`
- `helius keygen -o <path>`
- `helius signup --json`
- `helius signup -k <path> --json`
- `helius login --json`
- `helius login -k <path> --json`
- `helius projects --json`
- `helius project [id] --json`
- `helius apikeys --json`
- `helius apikeys create --json`
- `helius rpc --json`
- `helius usage --json`

### Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | Parse key/endpoints |
| 1 | General error | Retry with backoff |
| 10 | Not logged in | Run login |
| 11 | Keypair not found | Run keygen |
| 12 | Auth failed | Validate keypair |
| 20 | Insufficient SOL | Fund SOL |
| 21 | Insufficient USDC | Fund USDC |
| 22 | Payment failed | Retry/check network |
| 30 | No projects | Run signup |
| 31 | Project not found | Validate ID |
| 40 | API error | Exponential backoff |
| 41 | No API keys | Create API key |

Error shape:

```json
{
  "error": "INSUFFICIENT_USDC",
  "message": "Insufficient USDC",
  "have": 0.5,
  "need": 1,
  "fundAddress": "YourWalletAddress..."
}
```

### Suggested Retry Strategy

- Retry only transient failures.
- Do not blindly retry setup/funding errors (`11`, `20`, `21`).

Pseudo-logic:

```text
maxRetries = 3
baseDelay = 2000ms

for attempt in 1..maxRetries:
  run command
  if exitCode == 0: success
  if exitCode in [11, 20, 21]: return actionable error
  sleep(baseDelay * (2 ^ attempt))
```

## API Families and When To Use Them

- Solana RPC HTTP: base JSON-RPC methods
- Solana WebSockets: streaming subscriptions
- Enhanced WebSockets: advanced filters/parsed tx streams
- DAS API: NFTs/tokens/compressed assets
- Enhanced Transactions: parsed transaction history
- LaserStream gRPC: lowest latency streaming
- Sender: low-latency transaction submission
- Priority Fee API: fee estimation
- Wallet API: wallet-centric REST endpoints
- Webhooks: push notifications
- ZK Compression: compressed account/token workflows

### Quick Selection Guide

| Need | Prefer |
|------|--------|
| Wallet NFTs/tokens | DAS API (`getAssetsByOwner`) |
| Parsed tx history | Enhanced Transactions |
| HTTP event notifications | Webhooks |
| Real-time stream | WebSockets or LaserStream |
| Lowest latency stream | LaserStream gRPC |
| Priority fees | Priority Fee API |
| Reliable tx landing | Helius Sender |
| Wallet REST queries | Wallet API |

### Common Mistakes

| Avoid | Use Instead | Why |
|-------|-------------|-----|
| `getTokenAccountsByOwner` for rich assets | DAS `getAssetsByOwner` | DAS returns richer indexed metadata |
| `getSignaturesForAddress` + N calls | `getTransactionsForAddress` | Better server-side aggregation/filtering |
| Polling for real-time | WebSockets/LaserStream | Lower latency and lower waste |
| Plain `sendTransaction` for critical landing | Sender | Better routing/landing behavior |

## Endpoints and Auth

All API calls require query-param auth:

- `?api-key=YOUR_API_KEY`

Main endpoints:

- Mainnet RPC (Gateway preferred): `https://beta.helius-rpc.com/?api-key=YOUR_API_KEY`
- Mainnet RPC (standard): `https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY`
- Devnet RPC: `https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY`
- Mainnet WSS (Gateway preferred): `wss://beta.helius-rpc.com/?api-key=YOUR_API_KEY`
- Mainnet WSS (standard): `wss://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY`
- Devnet WSS: `wss://devnet.helius-rpc.com/?api-key=YOUR_API_KEY`
- Sender: `https://sender.helius-rpc.com/fast`

Health check:

```bash
curl "https://beta.helius-rpc.com/?api-key=YOUR_API_KEY" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

Expected:

```json
{"jsonrpc":"2.0","result":"ok","id":1}
```

## TrenchClaw Runtime Integration Notes

Existing Helius-related implementation in repo:

- Agentic signup sample: `src/solana/actions/agentic-signup/helius.ts`
- RPC routing/failover: `src/solana/lib/adapters/rpc-pool.ts`
- Personal runtime settings: `.runtime-state/user/settings.json`
- Active instance trading overrides: `.runtime-state/instances/<instanceId>/settings/trading.json`
- Secret refs live in `.runtime-state/user/vault.json` and use the tracked template `src/ai/config/vault.template.json`

Current runtime strategy:

- Prefer SDK/runtime-integrated flows for application behavior.
- Keep CLI for ops/bootstrap/manual recovery and account setup.

## Secrets and Safety

- Never put Helius API keys in client-side/browser code.
- Keep keys in vault/env-only locations.
- Recommended refs:
  - `vault://rpc/helius/http-url`
  - `vault://rpc/helius/ws-url`
  - `vault://rpc/helius/api-key`
- Recommended values:
  - `rpc.helius.http-url`: `https://beta.helius-rpc.com/?api-key=`
  - `rpc.helius.ws-url`: `wss://beta.helius-rpc.com/?api-key=`
- RPC selection policy:
  - Runtime does not auto-pick fallback providers.
  - Set user-selected RPC explicitly via `rpcUrl`/vault config or `RPC_URL`.

Operational constants:

- USDC mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Helius treasury: `CEs84tEowsXpH8u4VBf8rJSVgSRypFMfXw9CpGRtQgb6`
- CLI keypair path: `~/.helius-cli/keypair.json`
- CLI config path: `~/.helius-cli/config.json`
