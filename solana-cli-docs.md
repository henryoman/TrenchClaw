# Solana CLI Quick Reference

Source snapshot: `apps/trenchclaw/src/ai/brain/knowledge/deep-knowledge/solana-cli-docs.md`
Compiled: 2026-03-23

This is the fast command map for the Solana CLI.

## Install And Verify

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
solana --version
solana config get
```

## Config

| Command | What it does |
| --- | --- |
| `solana config get` | Show current CLI config |
| `solana config set --url https://api.mainnet-beta.solana.com` | Point at mainnet |
| `solana config set --url https://api.devnet.solana.com` | Point at devnet |
| `solana config set --keypair ~/.config/solana/id.json` | Set active keypair |

## Wallet Basics

| Command | What it does |
| --- | --- |
| `solana address` | Print active wallet address |
| `solana balance` | Show active wallet balance |
| `solana balance <ADDRESS>` | Show balance for any address |
| `solana account <ADDRESS>` | Inspect an account |
| `solana account <ADDRESS> --output json` | Inspect an account in JSON |
| `solana confirm <SIGNATURE> --verbose` | Inspect a transaction |

## Keygen

| Command | What it does |
| --- | --- |
| `solana-keygen new --outfile <FILE>` | Create a new keypair |
| `solana-keygen pubkey <FILE>` | Show public key for a keypair |
| `solana-keygen verify <ADDRESS> <FILE>` | Verify keypair controls address |

## Devnet

| Command | What it does |
| --- | --- |
| `solana airdrop 2` | Request a devnet airdrop |
| `solana airdrop 2 <ADDRESS>` | Airdrop to a specific address |

## Transfers

| Command | What it does |
| --- | --- |
| `solana transfer <RECIPIENT> 0.1 --allow-unfunded-recipient` | Send SOL |
| `solana transfer <RECIPIENT> 0.1 --allow-unfunded-recipient --no-wait` | Send without waiting |

## SPL Token Helpers

| Command | What it does |
| --- | --- |
| `spl-token create-token` | Create a token mint |
| `spl-token create-account <MINT>` | Create a token account |
| `spl-token mint <MINT> 1000` | Mint tokens |
| `spl-token accounts` | List token accounts |

## Good Safety Sequence

```bash
solana config get
solana address
solana balance
```

Run those before transfers, signing flows, or RPC-sensitive work.

## Good Everyday Commands

```bash
solana config get
solana address
solana balance
solana account <ADDRESS>
solana confirm <SIGNATURE> --verbose
```

## Working Rules

- Prefer devnet for testing unless the user explicitly wants mainnet.
- Do not assume the active RPC URL or keypair; verify them with `solana config get`.
- Treat `solana-keygen` as part of the same toolchain.
- Use this file for quick CLI lookups; use the deeper knowledge file for extra wallet details.
