# Helius Runtime Notes

Use Helius when TrenchClaw needs indexed Solana data instead of raw account scans.

## Current TrenchClaw Usage

- `getManagedWalletContents` prefers Helius DAS `getAssetsByOwner` when Helius is the selected private RPC
- `getManagedWalletContents` falls back to raw `getBalance` plus `getTokenAccountsByOwner` when Helius is not selected
- `getSwapHistory` uses Helius enhanced transaction history and requires a Helius API key

## Preferred Vault Fields

- `rpc.default.provider-id = helius`
- `rpc.default.api-key = <helius_api_key>`
- `rpc.default.http-url = https://mainnet.helius-rpc.com/?api-key=<helius_api_key>`
- `rpc.default.ws-url = wss://mainnet.helius-rpc.com/?api-key=<helius_api_key>`

Legacy compatibility fields still work:

- `rpc.helius.http-url`
- `rpc.helius.ws-url`
- `rpc.helius.api-key`

## Why Helius Here

- DAS returns fungible balances with richer metadata than raw token-account RPC
- DAS can also return collectible counts in the same owner-based holdings read
- enhanced transaction history is better for wallet swap-history reads than stitching raw signatures and tx fetches

## Live Docs

- Agent signup and CLI: https://dashboard.helius.dev/agents.md
- Helius docs index: https://www.helius.dev/docs/llms.txt
- DAS docs: https://www.helius.dev/docs/das-api
- CLI command reference: https://www.helius.dev/docs/agents/cli/commands