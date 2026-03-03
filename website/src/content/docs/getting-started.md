---
title: Getting Started
description: Detailed user setup from install to first launch, including one-command bootstrap, direct binary download, wallet setup, and GUI startup.
order: 1
---

This guide covers a full first-time local setup for TrenchClaw.

It includes everything you need that is not automatically bundled by JavaScript packages in `node_modules`.

## Before You Start

this is what you need:

- bun 1.3.10
- solana cli 3.0+
- the trenchclaw binary

## Step 1: Install TrenchClaw (Choose One Path)

### Path A (Recommended): One-Command Bootstrap Script

Use this if you want a single command that does everything needed.

```bash
curl -fsSL <TRENCHCLAW_BOOTSTRAP_SCRIPT_URL_PLACEHOLDER> | sh
```

Optional channel/version example:

```bash
curl -fsSL <TRENCHCLAW_BOOTSTRAP_SCRIPT_URL_PLACEHOLDER> | \
  TRENCHCLAW_CHANNEL=<CHANNEL_PLACEHOLDER> \
  TRENCHCLAW_VERSION=<VERSION_PLACEHOLDER> \
  sh
```

What this script should do:

1. Check whether `bun` is installed, install it if missing.
2. Check whether Solana CLI is installed, install it if missing.
3. Download and install TrenchClaw binary/app.
4. Put TrenchClaw on your `PATH` when needed.
5. Print a success summary and next commands.

After script completes, verify:

```bash
bun --version
solana --version
<trenchclaw_binary_name_placeholder> --version
```

### Path B: Direct Binary Download (If Dependencies Already Installed)

Use this if you already have required dependencies and only need TrenchClaw.

Download links (placeholders):

- macOS binary: `<APP_BINARY_MAC_PLACEHOLDER>`
- Windows binary: `<APP_BINARY_WINDOWS_PLACEHOLDER>`
- Linux binary: `<APP_BINARY_LINUX_PLACEHOLDER>`

After download:

1. Install/extract binary for your OS.
2. Ensure binary is available on `PATH`.
3. Verify:

```bash
<trenchclaw_binary_name_placeholder> --version
```

### Path C: Manual Setup (Source / Advanced)

Use this if you want full manual control.

Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
```

Install Solana CLI:

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.9/install)"
```

Verify both:

```bash
bun --version
solana --version
```

Download source (placeholder):

- `<SOURCE_DOWNLOAD_PLACEHOLDER>`

Install workspace dependencies:

```bash
bun install
```

## Step 2: Solana CLI Sanity Check

If `solana` is not found, add:

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

Restart terminal and verify again:

```bash
solana --version
```

Expected result: a version string like `solana-cli x.y.z`.

## Step 3: Create or Connect Your Wallet

If you already have a wallet keypair, use it. Otherwise create one:

```bash
solana-keygen new --outfile ~/.config/solana/id.json
```

Set it as active wallet:

```bash
solana config set --keypair ~/.config/solana/id.json
```

Check wallet address:

```bash
solana address
```

## Step 4: Select Network

Choose one:

```bash
# Devnet (recommended first)
solana config set --url https://api.devnet.solana.com

# Mainnet (real funds)
solana config set --url https://api.mainnet-beta.solana.com
```

Verify config:

```bash
solana config get
```

## Step 5: Fund Wallet

Check current balance:

```bash
solana balance
```

If using devnet:

```bash
solana airdrop 2
solana balance
```

If using mainnet: fund from your exchange or wallet app.

## Step 6: Configure Runtime Inputs

When TrenchClaw asks for setup values, provide:

- RPC URL
- LLM API key
- Model name

Minimum required to proceed successfully:

- one valid RPC URL
- one valid LLM API key

## Step 7: CLI Launch (Placeholder)

If running via binary CLI, launch with:

```bash
<APP_CLI_START_PLACEHOLDER_COMMAND>
```

Optional health check:

```bash
<APP_CLI_HEALTHCHECK_PLACEHOLDER_COMMAND>
```

## Step 8: Start TrenchClaw UI

If you installed app/binary:

```bash
<APP_START_PLACEHOLDER_COMMAND>
```

If you are running from source:

```bash
bun run launch:dev
```

Expected behavior:

- startup logs appear
- runtime and UI start
- GUI URL opens (or is printed)

## Step 9: Stop Point for This Guide

You are done when the GUI opens and you can interact with the interface.

At this point you should have:

- TrenchClaw running
- wallet configured
- RPC configured
- AI key configured

## First-Run Issues

### `solana: command not found`

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

Restart terminal and rerun `solana --version`.

### TrenchClaw command not found

- Ensure binary install directory is on `PATH`.
- Reopen terminal and rerun `<trenchclaw_binary_name_placeholder> --version`.

### RPC errors/timeouts

- Re-check RPC URL.
- Switch to a different endpoint.

### AI provider errors

- Re-check API key and model ID.
- Confirm your provider account has access/quota.

## Full Manual Command Checklist

```bash
# Bun
curl -fsSL https://bun.sh/install | bash
bun --version

# Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.9/install)"
solana --version

# Wallet + network
solana-keygen new --outfile ~/.config/solana/id.json
solana config set --keypair ~/.config/solana/id.json
solana config set --url https://api.devnet.solana.com
solana airdrop 2

# Source install path only
bun install
bun run launch:dev
```
