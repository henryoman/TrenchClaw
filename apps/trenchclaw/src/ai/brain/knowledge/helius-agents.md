# Helius Quick Ops: CLI + Action Access

Last verified: 2026-03-03

Use this top-level file for fast Helius operational actions only.
For full platform/API/signup details, read `deep-knowledge/helius.md`.
For the full agent docs index snapshot, read `deep-knowledge/helius-agents-llms.md`.

## Fast CLI Commands

- Install CLI: `npm install -g helius-cli`
- Check install: `helius --version`
- Login with existing keypair: `helius login --keypair /path/to/keypair.json --json`
- List projects: `helius projects --json`
- List API keys: `helius apikeys --json`
- Create API key: `helius apikeys create --json`
- Show RPC endpoints: `helius rpc --json`
- Check usage/credits: `helius usage --json`

## Fast Endpoint References

- Mainnet RPC (Gateway preferred): `https://beta.helius-rpc.com/?api-key=YOUR_API_KEY`
- Mainnet RPC (standard): `https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY`
- Devnet RPC: `https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY`
- Mainnet WSS (Gateway preferred): `wss://beta.helius-rpc.com/?api-key=YOUR_API_KEY`
- Mainnet WSS (standard): `wss://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY`
- Devnet WSS: `wss://devnet.helius-rpc.com/?api-key=YOUR_API_KEY`
- Sender: `https://sender.helius-rpc.com/fast`

## TrenchClaw Actions To Reach Quickly

Helius-specific / closely related action entry points:

- `src/solana/actions/agentic-signup/helius.ts`
- `src/solana/actions/data-fetch/index.ts`
- `src/solana/actions/data-fetch/rpc/getBalance.ts`
- `src/solana/actions/data-fetch/rpc/getAccountInfo.ts`
- `src/solana/actions/data-fetch/rpc/getMultipleAccounts.ts`
- `src/solana/actions/data-fetch/rpc/getMarketData.ts`
- `src/solana/actions/data-fetch/rpc/getTokenMetadata.ts`
- `src/solana/actions/data-fetch/rpc/getTokenPrice.ts`
- `src/solana/actions/wallet-based/read-only/checkBalance.ts`
- `src/solana/actions/wallet-based/read-only/checkSolBalance.ts`
- `src/solana/actions/wallet-based/read-only/getWalletState.ts`
- `src/solana/actions/wallet-based/swap/rpc/executeSwap.ts`
- `src/solana/actions/wallet-based/swap/rpc/quoteSwap.ts`
- `src/solana/actions/wallet-based/swap/ultra/swap.ts`
- `src/solana/actions/wallet-based/transfer/transfer.ts`

## Runtime Integration Points

- RPC provider pool: `src/solana/lib/adapters/rpc-pool.ts`
- User chain settings: `src/ai/brain/user-blockchain-settings/settings.yaml`
- Secret refs: `src/ai/brain/protected/no-read/README.md`

## Required Secret Keys / Refs

- `vault://rpc/helius/http-url`
- `vault://rpc/helius/ws-url`
- `vault://rpc/helius/api-key`

Recommended Helius values:

- `rpc.helius.http-url`: `https://beta.helius-rpc.com/?api-key=`
- `rpc.helius.ws-url`: `wss://beta.helius-rpc.com/?api-key=`

Related env vars used by runtime routing:

- `HELIUS_API_KEY`
- `QUICKNODE_API_KEY`
- `RPC_URL`

## Source Links

- Agent signup and CLI instructions: https://dashboard.helius.dev/agents.md
- Docs index (discover all pages): https://www.helius.dev/docs/llms.txt
- Agents docs index: https://www.helius.dev/docs/agents/llms.txt
- CLI repo: https://github.com/helius-labs/helius-cli

## Local Mirrors

- Full agents index snapshot: `src/ai/brain/knowledge/deep-knowledge/helius-agents-llms.md`
