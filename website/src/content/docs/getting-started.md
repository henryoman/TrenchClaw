---
title: Getting Started
description: Clean macOS-first setup with one command that installs or updates Bun, Solana CLI, Helius CLI, and TrenchClaw.
order: 1
---

Install everything you need on macOS with one command, then launch TrenchClaw.

## macOS Quickstart (One Command)

Run once in Terminal:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.placeholder/install/macos-bootstrap.sh | bash
```

What this does:

- installs or upgrades Bun
- installs Solana CLI if missing and updates it when available
- installs or upgrades Helius CLI with Bun
- installs or upgrades TrenchClaw
- prints all version checks at the end

### Pin a TrenchClaw version

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.placeholder/install/macos-bootstrap.sh | TRENCHCLAW_VERSION=v0.0.2 bash
```

## Verify

```bash
bun --version
solana --version
helius --version
trenchclaw --version
```

## Start TrenchClaw

```bash
trenchclaw
```

## Configure In App

On first launch, set:

- RPC endpoint(s)
- LLM provider key + model
- Wallet/key workflows

No `.env` setup is required for this path.

## Source/Dev Path (Maintainers)

For local development from source:

```bash
bun install
bun run launch:dev
```

## Build + Verify User Bundle

```bash
bun run app:clean
bun run app:build
bun run bundle:verify
```

Create release artifact:

```bash
bun run release:package -- --version v0.0.2
```

Generate release notes:

```bash
bun run release:notes -- --version v0.0.2 --output dist/release/release-notes.md
```

## Troubleshooting

### `trenchclaw: command not found`

Add paths, then open a new shell:

```bash
export PATH="$HOME/.bun/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.local/bin:$PATH"
```

Then rerun quickstart.

### Launcher says `Run ./setup.sh first`

Run:

```bash
~/.local/share/trenchclaw/current/setup.sh
```

Then re-run:

```bash
trenchclaw
```
