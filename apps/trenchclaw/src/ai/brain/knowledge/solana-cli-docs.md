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

---
title: File System Wallets using the CLI
pagination_label: File System Wallets using the CLI
sidebar_label: File System Wallets
sidebar_position: 2
---

This document describes how to create and use a file system wallet with the
Solana CLI tools. A file system wallet exists as an unencrypted keypair file
on your computer system's filesystem.

> File system wallets are the **least secure** method of storing SOL tokens. Storing large amounts of tokens in a file system wallet is **not recommended**.

## Before you Begin

Make sure you have
[installed the Solana Command Line Tools](../install.md)

## Generate a File System Wallet Keypair

Use Solana's command-line tool `solana-keygen` to generate keypair files. For
example, run the following from a command-line shell:

```bash
mkdir ~/my-solana-wallet
solana-keygen new --outfile ~/my-solana-wallet/my-keypair.json
```

This file contains your **unencrypted** keypair. In fact, even if you specify
a password, that password applies to the recovery seed phrase, not the file. Do
not share this file with others. Anyone with access to this file will have access
to all tokens sent to its public key. Instead, you should share only its public
key. To display its public key, run:

```bash
solana-keygen pubkey ~/my-solana-wallet/my-keypair.json
```

It will output a string of characters, such as:

```text
ErRr1caKzK8L8nn4xmEWtimYRiTCAZXjBtVphuZ5vMKy
```

This is the public key corresponding to the keypair in
`~/my-solana-wallet/my-keypair.json`. The public key of the keypair file is
your _wallet address_.

## Verify your Address against your Keypair file

To verify you hold the private key for a given address, use
`solana-keygen verify`:

```bash
solana-keygen verify <PUBKEY> ~/my-solana-wallet/my-keypair.json
```

where `<PUBKEY>` is replaced with your wallet address.
The command will output "Success" if the given address matches the
one in your keypair file, and "Failed" otherwise.

## Creating Multiple File System Wallet Addresses

You can create as many wallet addresses as you like. Simply re-run the
steps in [Generate a File System Wallet](#generate-a-file-system-wallet-keypair)
and make sure to use a new filename or path with the `--outfile` argument.
Multiple wallet addresses can be useful if you want to transfer tokens between
your own accounts for different purposes.
