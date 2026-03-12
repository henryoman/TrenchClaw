---
title: Getting Started
description: Install the standalone release, launch TrenchClaw, and know where the local runtime and state live.
order: 1
---

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

- fetches the real installer script from the TrenchClaw repository
- resolves the latest GitHub Release tag or uses `TRENCHCLAW_VERSION`
- downloads the matching platform tarball and `.sha256`
- verifies the checksum before extraction
- installs the app to `~/.local/share/trenchclaw/<version>/`
- updates `~/.local/share/trenchclaw/current`
- writes `~/.local/bin/trenchclaw`

The public installer does not install Bun, Solana CLI, or any other external tool by default.

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
  instances/
  protected/
    keypairs/
  user/
    vault.json
    vault.template.json
    workspace/
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

First launch is not blocked by missing Solana CLI tools. Install optional tools separately only when a specific feature asks for them.
