---
title: Solana CLI Quick Reference
sidebar_label: Solana CLI
sidebar_position: 3
---

# Solana CLI Quick Reference

This note exists so the runtime model has direct local guidance for common
Solana CLI operations. Treat the Solana CLI as the default local toolchain
for local wallet inspection, config management, balance checks, airdrops, and
transaction submission.

## Install and Verify

Install the stable Solana CLI with the Anza installer:

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
```

Verify the install:

```bash
solana --version
solana config get
```

## Common Config Commands

Show current CLI config:

```bash
solana config get
```

Point the CLI at mainnet:

```bash
solana config set --url https://api.mainnet-beta.solana.com
```

Point the CLI at devnet:

```bash
solana config set --url https://api.devnet.solana.com
```

Set the active keypair file:

```bash
solana config set --keypair ~/.config/solana/id.json
```

## Wallet and Address Commands

Print the active wallet address:

```bash
solana address
```

Print the balance of the active wallet:

```bash
solana balance
```

Print the balance of any address:

```bash
solana balance <ADDRESS>
```

Confirm a keypair matches an address:

```bash
solana-keygen verify <ADDRESS> ~/.config/solana/id.json
```

Show the public key for a keypair file:

```bash
solana-keygen pubkey ~/.config/solana/id.json
```

## Devnet Funding

Request a devnet airdrop:

```bash
solana airdrop 2
```

Request a devnet airdrop to a specific address:

```bash
solana airdrop 2 <ADDRESS>
```

## Transfers

Send SOL:

```bash
solana transfer <RECIPIENT_ADDRESS> 0.1 --allow-unfunded-recipient
```

Send SOL and skip the interactive confirmation prompt:

```bash
solana transfer <RECIPIENT_ADDRESS> 0.1 --allow-unfunded-recipient --no-wait
```

For high-risk flows, inspect config and balance first:

```bash
solana config get
solana address
solana balance
```

## Transaction and Account Inspection

Inspect a transaction:

```bash
solana confirm <SIGNATURE> --verbose
```

Inspect an account:

```bash
solana account <ADDRESS>
```

Inspect a program account in JSON:

```bash
solana account <ADDRESS> --output json
```

## Operational Guidance for the Model

- Prefer `solana config get`, `solana address`, and `solana balance` before any
  transfer or signing flow.
- Prefer devnet for testing unless the user explicitly wants mainnet.
- Do not assume the active RPC URL or keypair; verify them with `solana config get`.
- Use the Solana CLI for direct checks and debugging even when runtime actions
  exist for the same domain.
- Treat `solana-keygen` as part of the Solana CLI toolchain, not as a separate
  product dependency.
