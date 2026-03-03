---
title: Getting Started
description: Detailed user setup from install to first launch, including Bun, Solana CLI, wallet setup, runtime inputs, and GUI startup.
order: 1
---

# Getting Started

This guide is for users who want to run TrenchClaw end-to-end for the first time.

It covers the full flow from install to the point where your GUI is open and connected.

## Before You Start

You need:

- A Mac, Windows, or Linux machine
- Stable internet
- About 10-20 minutes

You will install or configure:

- TrenchClaw app (or source version)
- Solana CLI
- A Solana wallet
- RPC endpoint
- LLM API key

## Step 1: Install TrenchClaw

Choose one path.

### Path A (Recommended): Download the App

Download links (placeholders):

- macOS: `<APP_DOWNLOAD_MAC_PLACEHOLDER>`
- Windows: `<APP_DOWNLOAD_WINDOWS_PLACEHOLDER>`
- Linux: `<APP_DOWNLOAD_LINUX_PLACEHOLDER>`

After download:

1. Install the app normally for your OS.
2. Launch it once.
3. Keep it open for setup in later steps.

### Path B: Run from Source (Bun)

Use this path if you want to run from source in terminal.

Bun download:

- <https://bun.sh>

Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
```

Restart terminal, then verify:

```bash
bun --version
```

Download source (placeholder):

- `<SOURCE_DOWNLOAD_PLACEHOLDER>`

Open the project folder, then install dependencies:

```bash
bun install
```

What this does:

- Downloads JavaScript/TypeScript dependencies
- Prepares workspace packages so launch commands work

## Step 2: Install Solana CLI (Required)

Solana CLI is required for wallet/network setup.

Install link:

- <https://release.anza.xyz/v3.1.9/install>

Install command:

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.9/install)"
```

Verify installation:

```bash
solana --version
```

If terminal says command not found, add this and restart terminal:

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

Then run again:

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

Expected result: a base58 wallet address.

## Step 4: Pick Network (Devnet or Mainnet)

Choose one:

```bash
# Devnet (recommended for first run)
solana config set --url https://api.devnet.solana.com

# Mainnet (real funds)
solana config set --url https://api.mainnet-beta.solana.com
```

Verify active config:

```bash
solana config get
```

Expected result: shows your selected RPC URL and keypair path.

## Step 5: Fund Wallet

Check balance:

```bash
solana balance
```

If using devnet, request test SOL:

```bash
solana airdrop 2
solana balance
```

If using mainnet, send SOL from your exchange or wallet app.

Expected result: non-zero balance for the selected network.

## Step 6: Run Initial TrenchClaw Setup Inputs

When TrenchClaw prompts for configuration, provide:

- RPC URL
- LLM provider API key
- Model name

Minimum required values to continue:

- 1 valid RPC URL
- 1 valid LLM API key

Without both, the app may open but actions will fail.

## Step 7: CLI Check (Placeholder)

If your distribution includes a CLI binary, run this placeholder command:

```bash
<APP_CLI_PLACEHOLDER_COMMAND>
```

Optional quick check:

```bash
<APP_CLI_HEALTHCHECK_PLACEHOLDER_COMMAND>
```

Expected result: command responds without auth/config errors.

## Step 8: Start TrenchClaw

### If you installed the app (Path A)

Run app launch command (placeholder):

```bash
<APP_START_PLACEHOLDER_COMMAND>
```

Or open TrenchClaw from Applications / Start Menu.

### If you are running from source (Path B)

Start with:

```bash
bun run launch:dev
```

What you should see:

- Startup logs in terminal
- Runtime and frontend begin booting
- Local GUI URL appears

## Step 9: Stop Point for This Guide

You are done when the GUI opens in your browser or app window.

At this point you should have:

- TrenchClaw running
- Wallet configured
- RPC configured
- LLM key configured
- UI loaded and ready

## First-Run Issues

### `solana: command not found`

Fix PATH and restart terminal:

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

### RPC timeout or RPC unavailable

- Re-check RPC URL
- Switch to another endpoint
- Prefer a private provider RPC if public endpoint is overloaded

### Wallet errors on send/swap

- Confirm correct network (devnet vs mainnet)
- Confirm wallet has enough SOL

### LLM/provider errors

- Re-check API key
- Re-check model ID spelling
- Ensure model is available on your provider plan

## Command Checklist

Run these in order for source setup:

```bash
# 1) Bun
curl -fsSL https://bun.sh/install | bash
bun --version

# 2) Dependencies
bun install

# 3) Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.9/install)"
solana --version

# 4) Wallet + network
solana-keygen new --outfile ~/.config/solana/id.json
solana config set --keypair ~/.config/solana/id.json
solana config set --url https://api.devnet.solana.com
solana airdrop 2

# 5) Start TrenchClaw
bun run launch:dev
```
