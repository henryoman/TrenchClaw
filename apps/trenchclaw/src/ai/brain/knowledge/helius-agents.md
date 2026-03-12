# Helius Quick Ops: CLI + RPC Command Cookbook

Last verified: 2026-03-03

Use this file for high-signal Helius operations: wallet creation, funding, transfers, and direct RPC/DAS JSON methods.

## One-Time Setup

```bash
# Helius CLI
npm install -g helius-cli

# Solana + SPL CLI (if missing)
# https://docs.solana.com/cli/install-solana-cli-tools
# https://spl.solana.com/token

# Authenticate with Helius
helius keygen
helius signup --json
helius login --keypair ~/.helius-cli/keypair.json --json

# Grab a key, then export endpoint
export HELIUS_API_KEY="<your_api_key>"
export RPC_URL="https://beta.helius-rpc.com/?api-key=${HELIUS_API_KEY}"
```

Useful checks:

- `helius --version`
- `helius projects --json`
- `helius apikeys --json`
- `helius apikeys create --json`
- `helius rpc --json`
- `helius usage --json`

## Wallet Ops (Actually Useful)

```bash
# Create a new wallet keypair
mkdir -p ~/.wallets
solana-keygen new --outfile ~/.wallets/dev-wallet.json

# Print wallet pubkey
solana-keygen pubkey ~/.wallets/dev-wallet.json

# Verify keypair controls pubkey
solana-keygen verify "$(solana-keygen pubkey ~/.wallets/dev-wallet.json)" ~/.wallets/dev-wallet.json

# Point Solana CLI at Helius (mainnet)
solana config set --url "$RPC_URL"
solana config set --keypair ~/.wallets/dev-wallet.json
solana config get

# Devnet airdrop flow
export DEVNET_RPC_URL="https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}"
solana config set --url "$DEVNET_RPC_URL"
solana airdrop 2
solana balance

# Transfer SOL
solana transfer <TO_PUBKEY> 0.1 --allow-unfunded-recipient
```

## SPL Token Ops

```bash
# Ensure CLI is on Helius endpoint first
solana config set --url "$RPC_URL"

# Create token mint + associated token account, then mint
spl-token create-token
spl-token create-account <TOKEN_MINT_ADDRESS>
spl-token mint <TOKEN_MINT_ADDRESS> 1000

# Check token balances
spl-token accounts
```

## JSON-RPC: Copy/Paste Requests

```bash
export HELIUS_API_KEY="<your_api_key>"
export RPC_URL="https://beta.helius-rpc.com/?api-key=${HELIUS_API_KEY}"
export OWNER="<wallet_pubkey>"

rpc() {
  local method="$1"
  local params="$2"
  curl -sS "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":${params}}"
}
```

```bash
# 1) SOL balance (lamports)
rpc "getBalance" "[\"${OWNER}\"]" | jq '.result.value'

# 2) Latest blockhash
rpc "getLatestBlockhash" "[{\"commitment\":\"confirmed\"}]" | jq '.result.value.blockhash'

# 3) Account info
rpc "getAccountInfo" "[\"${OWNER}\", {\"encoding\":\"base64\"}]" | jq '.result.value'

# 4) SPL token accounts by owner
rpc "getTokenAccountsByOwner" "[\"${OWNER}\", {\"programId\":\"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA\"}, {\"encoding\":\"jsonParsed\"}]" | jq '.result.value | length'

# 5) Recent signatures
rpc "getSignaturesForAddress" "[\"${OWNER}\", {\"limit\":10}]" | jq '.result[0]'

# 6) Full tx details for a signature
export SIG="<transaction_signature>"
rpc "getTransaction" "[\"${SIG}\", {\"encoding\":\"jsonParsed\",\"maxSupportedTransactionVersion\":0}]" | jq '.result'

# 7) Simulate a base64 tx (pre-send checks)
export TX_B64="<base64_tx>"
rpc "simulateTransaction" "[\"${TX_B64}\", {\"encoding\":\"base64\",\"replaceRecentBlockhash\":true}]" | jq '.result.err, .result.logs'

# 8) Send a base64 tx
rpc "sendTransaction" "[\"${TX_B64}\", {\"encoding\":\"base64\",\"skipPreflight\":false,\"maxRetries\":3}]" | jq '.result'

# 9) Helius priority fee estimate
rpc "getPriorityFeeEstimate" "[{\"accountKeys\":[\"${OWNER}\"],\"options\":{\"recommended\":true}}]" | jq '.result'
```

## DAS API Methods (Helius-Indexed)

```bash
# getAssetsByOwner (NFTs + fungibles with metadata)
rpc "getAssetsByOwner" "[{\"ownerAddress\":\"${OWNER}\",\"page\":1,\"limit\":50,\"displayOptions\":{\"showFungible\":true}}]" | jq '.result.items | length'

# getAsset by asset id
export ASSET_ID="<asset_id>"
rpc "getAsset" "[{\"id\":\"${ASSET_ID}\"}]" | jq '.result.id, .result.ownership.owner'

# getSignaturesForAsset (compressed NFT history)
rpc "getSignaturesForAsset" "[{\"id\":\"${ASSET_ID}\",\"page\":1,\"limit\":20}]" | jq '.result.items[0]'

# getTransactionsForAddress (Helius aggregated history)
rpc "getTransactionsForAddress" "[{\"address\":\"${OWNER}\",\"limit\":20}]" | jq '.result[0]'
```

## Endpoint References

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
- Personal runtime settings: `.runtime-state/user/settings.json`
- Active instance trading settings: `.runtime-state/instances/01/settings/trading.json`
- Secret refs: `.runtime-state/user/vault.json` with tracked defaults in `src/ai/config/vault.template.json`

## Required Secret Keys / Refs

- `vault://rpc/helius/http-url`
- `vault://rpc/helius/ws-url`
- `vault://rpc/helius/api-key`

Recommended Helius values:

- `rpc.helius.http-url`: `https://beta.helius-rpc.com/?api-key=`
- `rpc.helius.ws-url`: `wss://beta.helius-rpc.com/?api-key=`

RPC selection policy:

- Runtime does not auto-pick fallback providers.
- Set user-selected RPC explicitly via `rpcUrl`/vault config or `RPC_URL`.

Related env vars used by runtime routing:

- `HELIUS_API_KEY`
- `QUICKNODE_API_KEY`
- `RPC_URL`

## Source Links

- Agent signup and CLI instructions: https://dashboard.helius.dev/agents.md
- Docs index (discover all pages): https://www.helius.dev/docs/llms.txt
- Agents docs index: https://www.helius.dev/docs/agents/llms.txt
- CLI repo: https://github.com/helius-labs/helius-cli

## Where To Find More Helius Info

- Deep reference (repo-authored): `src/ai/brain/knowledge/deep-knowledge/helius.md`
- Agents docs index snapshot (downloaded): `src/ai/brain/knowledge/deep-knowledge/helius-agents-llms.md`
- Full docs index snapshot (downloaded): `src/ai/brain/knowledge/deep-knowledge/helius-docs-llms-full.md`
