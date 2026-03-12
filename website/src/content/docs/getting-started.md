---
title: Getting Started
description: Install the standalone release, launch TrenchClaw, and know where the local runtime and state live.
order: 1
---

## Package Type

Current public builds are a standalone `trenchclaw` executable.

- Bun is embedded in the binary
- the installer also installs Solana CLI tools
- writable runtime state is stored outside the release bundle

## Supported Targets

The default packaging script currently builds:

- `darwin-arm64`
- `linux-x64`
- `linux-arm64`

## Install

### macOS

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/macos-bootstrap.sh | bash
```

### Linux

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | bash
```

## What The Installer Does

- downloads a published GitHub Release artifact for the requested version and detected platform
- installs `trenchclaw` into `~/.local/bin`
- installs or updates the Solana CLI
- adds the expected bin paths to common shell profiles when missing

## Pin A Specific Release

### macOS

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/macos-bootstrap.sh | TRENCHCLAW_VERSION=v0.0.2 bash
```

### Linux

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | TRENCHCLAW_VERSION=v0.0.2 bash
```

## Launch

```bash
trenchclaw
```

Default local ports:

- runtime API: `127.0.0.1:4020`
- GUI: `127.0.0.1:4173`

If those ports are busy, TrenchClaw uses the next available local ports.

## First Run

On first launch, set up:

- an instance
- RPC settings
- AI provider secrets if you want chat features

Default writable state root:

- macOS: `~/Library/Application Support/TrenchClaw/state`
- Linux: `~/.local/share/trenchclaw/state`

## Troubleshooting

### `trenchclaw: command not found`

Reload your shell, or add both expected bin directories:

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.local/bin:$PATH"
```

Then open a new shell and retry.

### Release download fails

Check:

- the GitHub Release exists
- the target artifact for your platform exists
- the tag matches `TRENCHCLAW_VERSION` if you pinned one

### Solana CLI install fails

Required tools:

- `curl`
- `tar`
- `sh`
