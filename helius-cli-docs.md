# Helius CLI Command Reference

Source snapshot: `apps/trenchclaw/src/ai/brain/knowledge/deep-knowledge/helius-cli-commands.md`
Compiled: 2026-03-23

This is the fast command map for the `helius` CLI.

## Setup

```bash
helius --version
helius config show
helius config set-api-key <key>
helius config set-network mainnet
helius config set-project <project-id>
```

## Account Management

| Command | What it does |
| --- | --- |
| `helius keygen` | Generate a new Solana keypair |
| `helius signup` | Create a Helius account |
| `helius login` | Authenticate with an existing wallet |
| `helius upgrade` | Upgrade your plan |
| `helius pay <payment-intent-id>` | Pay an existing payment intent |

## Project And API Keys

| Command | What it does |
| --- | --- |
| `helius projects` | List all projects |
| `helius project <id>` | Get project details |
| `helius apikeys <project-id>` | List API keys for a project |
| `helius apikeys create <project-id>` | Create a new API key |
| `helius usage <project-id>` | Show credits usage |
| `helius rpc <project-id>` | Show RPC endpoints |

## Config

| Command | What it does |
| --- | --- |
| `helius config show` | Show current config |
| `helius config set-api-key <key>` | Set Helius API key |
| `helius config set-network <network>` | Set network |
| `helius config set-project <id>` | Set default project |
| `helius config clear` | Clear config |

## Balances And Tokens

| Command | What it does |
| --- | --- |
| `helius balance <address>` | Get native SOL balance |
| `helius tokens <address>` | Get fungible token balances |
| `helius token-holders <mint>` | Get top holders of a token |

## Transactions

| Command | What it does |
| --- | --- |
| `helius tx parse <signature...>` | Parse transactions into readable output |
| `helius tx history <address>` | Get enhanced transaction history |
| `helius tx fees` | Get priority fee estimates |

## DAS / Assets

| Command | What it does |
| --- | --- |
| `helius asset get <mint>` | Get asset details by mint |
| `helius asset batch <mint...>` | Get multiple assets |
| `helius asset owner <owner>` | Get assets by owner |
| `helius asset creator <creator>` | Get assets by creator |
| `helius asset authority <authority>` | Get assets by update authority |
| `helius asset collection <collection>` | Get assets in a collection |
| `helius asset search` | Search assets with filters |
| `helius asset proof <asset>` | Get Merkle proof for a compressed NFT |
| `helius asset proof-batch <asset...>` | Get multiple proofs |
| `helius asset editions <mint>` | Get NFT editions |
| `helius asset signatures <asset>` | Get signatures for an asset |
| `helius asset token-accounts` | Query token accounts |

## Wallet API

| Command | What it does |
| --- | --- |
| `helius wallet identity <wallet>` | Look up wallet owner identity |
| `helius wallet identity-batch <wallet...>` | Batch identity lookup |
| `helius wallet balances <wallet>` | Get balances with USD values |
| `helius wallet history <wallet>` | Get transaction history with balance changes |
| `helius wallet transfers <wallet>` | Get token transfers |
| `helius wallet funded-by <wallet>` | Find original funding source |

## Webhooks

| Command | What it does |
| --- | --- |
| `helius webhook list` | List webhooks |
| `helius webhook get <id>` | Get webhook details |
| `helius webhook create` | Create a webhook |
| `helius webhook update <id>` | Update a webhook |
| `helius webhook delete <id>` | Delete a webhook |

## Sending

| Command | What it does |
| --- | --- |
| `helius send broadcast <signed-tx>` | Broadcast and poll for confirmation |
| `helius send raw <raw-tx>` | Send raw transaction |
| `helius send sender <signed-tx>` | Send via Helius Sender |
| `helius send poll <signature>` | Poll transaction status |
| `helius send compute-units <signed-tx>` | Estimate compute units |

## WebSocket Streaming

| Command | What it does |
| --- | --- |
| `helius ws account <account>` | Stream account change notifications |
| `helius ws logs` | Stream log notifications |
| `helius ws slot` | Stream slot notifications |
| `helius ws signature <signature>` | Stream signature confirmation |
| `helius ws program <program>` | Stream program account changes |

## Program Accounts

| Command | What it does |
| --- | --- |
| `helius program accounts <program>` | Get accounts owned by a program |
| `helius program accounts-all <program>` | Get all program accounts |
| `helius program token-accounts <owner>` | Get token accounts by owner |

## Staking

| Command | What it does |
| --- | --- |
| `helius stake create <amount>` | Create a stake transaction |
| `helius stake unstake <stake-account>` | Unstake |
| `helius stake withdraw <stake-account>` | Withdraw staked SOL |
| `helius stake accounts` | List Helius stake accounts |
| `helius stake withdrawable` | Check withdrawable amount |

## ZK Compression

| Command | What it does |
| --- | --- |
| `helius zk account <account>` | Get compressed account |
| `helius zk accounts-by-owner <owner>` | Get compressed accounts by owner |
| `helius zk balance <account>` | Get compressed balance |
| `helius zk token-accounts-by-owner <owner>` | Get compressed token accounts by owner |
| `helius zk proofs <asset...>` | Get multiple proofs |
| `helius zk validity-proof` | Get validity proof |
| `helius zk indexer-health` | Check indexer health |

## Good Everyday Commands

```bash
helius config show
helius projects --json
helius rpc <project-id> --json
helius wallet balances <wallet> --json
helius asset owner <wallet> --json
helius tx history <wallet> --json
```

## Working Rules

- Prefer `--json` when available.
- Use this file when you need the quickest `helius` subcommand lookup.
- For deeper API details, use the knowledge files under `apps/trenchclaw/src/ai/brain/knowledge/skills/helius/references/`.
