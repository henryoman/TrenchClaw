---
title: Getting Started
description: Install the current standalone release, launch the local runtime, and understand what the packaged app actually does on first run.
order: 1
---

This guide documents the current packaged-release path as it exists in the repo today.

## What The Release Actually Is

Current public builds are packaged as a standalone `trenchclaw` executable.

- Bun is embedded in the packaged binary
- the installer also installs or updates the required Solana CLI tools
- the readonly app bundle is separate from your writable runtime state
- first launch creates local state outside the release bundle

## Supported Targets In The Current Packaging Script

The default release packager currently builds these targets:

- `darwin-arm64`
- `linux-x64`
- `linux-arm64`

Do not assume every macOS or Linux architecture has a published artifact unless that release actually includes it.

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
- installs or upgrades the `trenchclaw` launcher into `~/.local/bin`
- installs or updates the Solana CLI into `~/.local/share/solana/install/active_release/bin`
- appends those paths to common shell profiles when missing
- keeps vaults, databases, logs, and instance state out of the packaged release directory

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

Start the app with:

```bash
trenchclaw
```

The packaged runner currently does all of this in one local process:

- resolves the packaged layout
- creates the writable runtime-state layout if needed
- starts the runtime API on localhost near `127.0.0.1:4020`
- serves the local GUI on localhost near `127.0.0.1:4173`
- prompts whether to open the browser automatically

If those default ports are occupied, the runner walks upward to the next available local ports.

## First-Run State Location

For packaged releases, the default writable state root is:

- macOS: `~/Library/Application Support/TrenchClaw/state`
- Linux: `~/.local/share/trenchclaw/state`

That state root holds the runtime database, sessions, memory logs, vault file, and per-instance protected directories.

## Initial Operator Setup

On first run, expect to configure:

- an instance profile
- Solana RPC settings
- AI provider credentials if you want chat/model features
- wallet workflows for the active instance

The packaged path is local-first. You do not need a project `.env` file just to launch the public release.

## Verification Notes

Use `trenchclaw` to launch the app.

Current public docs intentionally do not recommend `trenchclaw --version` as the primary verification step, because the packaged runner is documented here as an app launcher rather than a dedicated version-reporting CLI.

## Release Requirements

The hosted installers depend on published GitHub Releases. A successful end-user install requires:

- the release tag to exist
- the expected tarball for the target platform to be attached
- the bootstrap script URLs to point at the intended installer path

## Troubleshooting

### `trenchclaw: command not found`

Reload your shell, or add both expected bin directories:

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.local/bin:$PATH"
```

Then open a fresh shell and retry.

### Release download fails

Check:

- the GitHub Release exists
- the target artifact for your platform exists
- the tag matches `TRENCHCLAW_VERSION` if you pinned one

### Solana CLI install fails

The installer expects:

- `curl`
- `tar`
- `sh`

### The browser does not open automatically

That does not prevent the runtime from starting. Watch the terminal output for the local GUI URL and open it manually.
