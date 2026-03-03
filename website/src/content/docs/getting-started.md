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
curl -fsSL https://downloads.trenchclaw.dev/install.sh | sh
```

Optional channel/version example:

```bash
curl -fsSL https://downloads.trenchclaw.dev/install.sh | \
  TRENCHCLAW_CHANNEL=stable \
  TRENCHCLAW_VERSION=latest \
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
trenchclaw --version
```

### Path B: Direct Binary Download (If Dependencies Already Installed)

Use this if you already have required dependencies and only need TrenchClaw.

Download links (placeholders):

- macOS binary: `https://downloads.trenchclaw.dev/stable/latest/trenchclaw-darwin-arm64`
- Windows binary: `https://downloads.trenchclaw.dev/stable/latest/trenchclaw-windows-x64.exe`
- Linux binary: `https://downloads.trenchclaw.dev/stable/latest/trenchclaw-linux-x64`

After download:

1. Install/extract binary for your OS.
2. Ensure binary is available on `PATH`.
3. Verify:

```bash
trenchclaw --version
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

Download source:

- `https://github.com/trenchclaw/trenchclaw`

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

## Step 3: Configure Runtime Inputs

When TrenchClaw asks for setup values, provide:

- RPC URL
- LLM API key
- Model name

Minimum required to proceed successfully:

- one valid RPC URL
- one valid LLM API key

Wallet creation/import is done inside the TrenchClaw app.

## Step 4: CLI Launch (Placeholder)

If running via binary CLI, launch with:

```bash
trenchclaw
```

Optional health check:

```bash
trenchclaw --help
```

## Step 5: Start TrenchClaw UI

If you installed app/binary:

```bash
trenchclaw
```

If you are running from source:

```bash
bun run launch:dev
```

Expected behavior:

- startup logs appear
- runtime and UI start
- GUI URL opens (or is printed)

## Step 6: Stop Point for This Guide

You are done when the GUI opens and you can interact with the interface.

At this point you should have:

- TrenchClaw running
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
- Reopen terminal and rerun `trenchclaw --version`.

### RPC errors/timeouts

- Re-check RPC URL.
- Switch to a different endpoint.

### AI provider errors

- Re-check API key and model ID.
- Confirm your provider account has access/quota.
