---
title: Getting Started
description: One-command macOS and Linux setup that installs the standalone TrenchClaw release with no Bun requirement.
order: 1
---

Install the standalone TrenchClaw release on macOS or Linux with one command, then launch it.

## Quickstart (One Command Per OS)

### macOS

Run once in Terminal:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/macos-bootstrap.sh | bash
```

### Linux

Run once in Terminal:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | bash
```

What each installer does:

- installs or upgrades TrenchClaw
- installs a standalone binary release for your current platform
- prints the installed TrenchClaw version at the end

### Pin a TrenchClaw version

macOS:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/macos-bootstrap.sh | TRENCHCLAW_VERSION=v0.0.2 bash
```

Linux:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | TRENCHCLAW_VERSION=v0.0.2 bash
```

## Verify

```bash
trenchclaw --version
```

## Start TrenchClaw

```bash
trenchclaw
```

## Initial Configuration

On first launch, set:

- RPC endpoint(s)
- LLM provider key + model
- Wallet/key workflows

No `.env` setup is required for this path.

## Troubleshooting

### `trenchclaw: command not found`

Add paths, then open a new shell:

```bash
export PATH="$HOME/.bun/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.local/bin:$PATH"
```

Then rerun quickstart.
