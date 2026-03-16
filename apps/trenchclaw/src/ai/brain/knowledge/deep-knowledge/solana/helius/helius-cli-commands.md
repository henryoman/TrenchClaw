# Helius CLI Command Reference

Source snapshot: <https://www.helius.dev/docs/agents/cli/commands>
Fetched: 2026-03-16

This file mirrors the command families documented by Helius for the `helius` CLI.

## Account Management

| Command | Description |
| --- | --- |
| `helius keygen` | Generate a new Solana keypair |
| `helius signup` | Create a Helius account |
| `helius login` | Authenticate with an existing wallet |
| `helius upgrade` | Upgrade your plan |
| `helius pay <payment-intent-id>` | Pay an existing payment intent |

## Project And API Key Management

| Command | Description |
| --- | --- |
| `helius projects` | List all projects |
| `helius project [id]` | Get project details |
| `helius apikeys [project-id]` | List API keys for a project |
| `helius apikeys create [project-id]` | Create a new API key |
| `helius usage [project-id]` | Show credits usage |
| `helius rpc [project-id]` | Show RPC endpoints |

## Configuration

| Command | Description |
| --- | --- |
| `helius config show` | Show current config |
| `helius config set-api-key <key>` | Set Helius API key |
| `helius config set-network <network>` | Set network (`mainnet` or `devnet`) |
| `helius config set-project <id>` | Set default project ID |
| `helius config clear` | Clear all configuration |

## Balance And Tokens

| Command | Description |
| --- | --- |
| `helius balance <address>` | Get native SOL balance |
| `helius tokens <address>` | Get fungible token balances |
| `helius token-holders <mint>` | Get top holders of a token |

## Transactions

| Command | Description |
| --- | --- |
| `helius tx parse <signature...>` | Parse transaction(s) into human-readable format |
| `helius tx history <address>` | Get enhanced transaction history |
| `helius tx fees` | Get priority fee estimates |

## Digital Assets (DAS API)

| Command | Description |
| --- | --- |
| `helius asset get <mint>` | Get asset details by mint address |
| `helius asset batch <mint...>` | Get multiple assets |
| `helius asset owner <owner>` | Get assets by owner |
| `helius asset creator <creator>` | Get assets by creator |
| `helius asset authority <authority>` | Get assets by update authority |
| `helius asset collection <collection>` | Get assets in a collection |
| `helius asset search` | Search with filters |
| `helius asset proof <asset>` | Get Merkle proof for a compressed NFT |
| `helius asset proof-batch <asset...>` | Batch Merkle proofs |
| `helius asset editions <mint>` | Get NFT editions |
| `helius asset signatures <asset>` | Get transaction signatures for an asset |
| `helius asset token-accounts` | Query token accounts |

## Wallet API

| Command | Description |
| --- | --- |
| `helius wallet identity <wallet>` | Look up who owns a wallet |
| `helius wallet identity-batch <wallet...>` | Batch identity lookup |
| `helius wallet balances <wallet>` | Get all token balances with USD values |
| `helius wallet history <wallet>` | Transaction history with balance changes |
| `helius wallet transfers <wallet>` | Token transfers with sender and recipient info |
| `helius wallet funded-by <wallet>` | Find original funding source |

## Webhooks

| Command | Description |
| --- | --- |
| `helius webhook list` | List all webhooks |
| `helius webhook get <id>` | Get webhook details |
| `helius webhook create` | Create a webhook |
| `helius webhook update <id>` | Update a webhook |
| `helius webhook delete <id>` | Delete a webhook |

## Transaction Sending

| Command | Description |
| --- | --- |
| `helius send broadcast <signed-tx>` | Broadcast a signed transaction and poll for confirmation |
| `helius send raw <raw-tx>` | Send a raw transaction |
| `helius send sender <signed-tx>` | Send via Helius Sender |
| `helius send poll <signature>` | Poll transaction status until confirmed |
| `helius send compute-units <signed-tx>` | Simulate and return compute unit estimate |

## WebSocket Subscriptions

| Command | Description |
| --- | --- |
| `helius ws account <account>` | Stream account change notifications |
| `helius ws logs` | Stream log notifications |
| `helius ws slot` | Stream slot notifications |
| `helius ws signature <signature>` | Stream signature confirmation |
| `helius ws program <program>` | Stream program account changes |

## Program Accounts

| Command | Description |
| --- | --- |
| `helius program accounts <program>` | Get accounts owned by a program |
| `helius program accounts-all <program>` | Get all program accounts |
| `helius program token-accounts <owner>` | Get token accounts by owner |

## Staking

| Command | Description |
| --- | --- |
| `helius stake create <amount>` | Create a stake transaction |
| `helius stake unstake <stake-account>` | Unstake |
| `helius stake withdraw <stake-account>` | Withdraw staked SOL |
| `helius stake accounts` | List Helius stake accounts |
| `helius stake withdrawable` | Check withdrawable amount |
| `helius stake instructions` | Get stake instructions |
| `helius stake unstake-instruction` | Get unstake instruction |
| `helius stake withdraw-instruction` | Get withdraw instruction |

## ZK Compression

Representative commands from the documented `helius zk` family:

| Command | Description |
| --- | --- |
| `helius zk account <account>` | Get compressed account |
| `helius zk accounts-by-owner <owner>` | Get compressed accounts by owner |
| `helius zk balance <account>` | Get compressed balance |
| `helius zk token-accounts-by-owner <owner>` | Get compressed token accounts by owner |
| `helius zk proofs <asset...>` | Get multiple proofs |
| `helius zk validity-proof` | Get validity proof |
| `helius zk indexer-health` | Check ZK indexer health |
| `helius zk signatures-for-asset <asset>` | Compression signatures for asset |

## Account And Network

| Command | Description |
| --- | --- |
| `helius account <address>` | Get Solana account info |
| `helius network-status` | Get Solana network status |
| `helius block <slot>` | Get block details by slot number |

## Solana Improvement Documents

| Command | Description |
| --- | --- |
| `helius simd list` | List all SIMD proposals |
| `helius simd get <number>` | Read a specific SIMD |

## Working Rules

- Every command supports `--json`.
- Every command supports `--api-key` and `--network` overrides.
- Prefer this file when the user is asking "which `helius` command do I need?"
