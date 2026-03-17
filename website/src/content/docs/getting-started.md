---
title: Getting Started
description: Install the standalone release, set up only the keys and tools you actually need, and know where the local runtime and state live.
order: 1
featured: true
---

## Get Started

This guide covers the shipped install path, the current beta dependency story, and the local runtime layout.

## Package Type

Current public builds ship as a standalone compiled binary named `trenchclaw`.

- end users do not need Bun installed
- GitHub Releases is the only installable binary distribution channel
- writable runtime state lives outside the install tree

## Supported Targets

Published release artifacts are built for:

- `darwin-arm64`
- `linux-x64`
- `linux-arm64`

## Install TrenchClaw

### Install on macOS

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/macos-bootstrap.sh | bash
```

### Install on Linux

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | bash
```

## Optional Workflow Prerequisites

If you want TrenchClaw to install or update the optional external CLIs for you, run:

```bash
curl -fsSL https://raw.githubusercontent.com/henryoman/trenchclaw/main/scripts/install-required-tools.sh | sh
```

Today that helper manages Solana CLI and Helius CLI. For Helius CLI it prefers `bun`, then `pnpm`, then `npm`, and prints manual follow-up commands if none of those package managers are installed.

The current beta does not require those CLIs for baseline install or first launch. Install them only when a specific workflow or shell command asks for them.

Make sure the following are set up before the matching workflows:

- `Solana CLI` - optional shell and power-user tooling.

  ```bash
  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
  ```

- `Helius CLI` - optional shell and power-user tooling.

  ```bash
  bun add -g helius-cli@latest
  ```

- `Helius API key` - required when you want Helius-backed wallet enrichment or swap-history reads.
- `OpenRouter API key` - required for the default chat-driven workflow path, unless you switch to Gateway.
- `Jupiter Ultra API key` - required for Jupiter Ultra swaps and trigger-order flows.

Helius' current Node SDK is built on `@solana/kit`, so the Helius docs and the runtime's Solana stack now line up on the same client model when you need deeper RPC examples.

If you already have a Helius API key, these are the most useful first-run CLI commands:

```bash
helius config set-api-key YOUR_API_KEY
helius projects
helius rpc <project-id>
```

Useful checks:

```bash
solana --version
helius --version
trenchclaw doctor
```

## What The Installer Does

- fetches the real installer script from the TrenchClaw repository
- resolves the latest GitHub Release tag or uses `TRENCHCLAW_VERSION`
- downloads the matching platform tarball and `.sha256`
- verifies the checksum before extraction
- installs the app to `~/.local/share/trenchclaw/<version>/`
- updates `~/.local/share/trenchclaw/current`
- writes `~/.local/bin/trenchclaw`

The public installer does not install Bun, Solana CLI, Helius CLI, or any other external tool by default. Use the helper script when you want TrenchClaw to manage that optional toolchain for you.

## Pin A Specific Release

### Pin on macOS

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/macos-bootstrap.sh | TRENCHCLAW_VERSION=v0.0.0-beta.1 bash
```

### Pin on Linux

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | TRENCHCLAW_VERSION=v0.0.0-beta.1 bash
```

## Launch

```bash
trenchclaw
```

After install, run:

```bash
trenchclaw doctor
```

That reports which keys, CLIs, and beta workflows are currently ready on this machine.

Default local ports:

- runtime API: `127.0.0.1:4020`
- GUI: `127.0.0.1:4173`

If those ports are busy, TrenchClaw selects the next available local ports.

## State Layout

Readonly install root:

```text
~/.local/share/trenchclaw/
  current -> ~/.local/share/trenchclaw/<version>
  <version>/
    trenchclaw
    gui/
    core/
    release-metadata.json
```

Writable state root:

```text
~/.trenchclaw/
  db/
  generated/
  runtime/
    ai.json
    settings.json
  instances/
    active-instance.json
    <id>/
      instance.json
      vault.json
      keypairs/
      settings/
        trading.json
  protected/
    keypairs/
```

## Troubleshooting

### `trenchclaw: command not found`

Reload your shell, or ensure `~/.local/bin` is on `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Then open a new shell and retry.

### Release download fails

Check:

- the GitHub Release exists
- the target artifact for your platform exists
- the tag matches `TRENCHCLAW_VERSION` if you pinned one

### Checksum verification fails

The installer stops on checksum mismatch. Retry the install after confirming the release assets finished publishing correctly.

### Optional external tools are missing

First launch is not blocked by missing Solana CLI or Helius CLI tools. Install optional tools separately only when a specific feature or shell workflow asks for them, then rerun `trenchclaw doctor`.
