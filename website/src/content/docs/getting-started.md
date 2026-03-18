---
title: Getting Started
description: Install the release, launch the beta correctly, use the recommended defaults, and get the app ready without guessing.
order: 1
featured: true
---

## What This Beta Actually Covers

This beta is centered on a small set of workflows we can stand behind today:

- local runtime and local GUI boot
- instance creation and sign-in
- AI-backed chat workflows
- managed wallet reads
- Jupiter Ultra swap flows when you add the right key

The app does not ask you to install every optional dependency up front. Start with the release, confirm the app boots, then add only the keys and tools required by the workflows you actually want.

## Recommended Defaults

For a clean first setup, use these defaults:

- AI provider: `OpenRouter`
- model: `openai/gpt-5.4`
- RPC: start with a public Solana RPC for basic first launch
- Helius: add it only when you want enriched wallet reads or swap history
- Jupiter Ultra API key: add it only when you want swaps or trigger orders
- optional CLIs: skip them until a workflow explicitly needs them

TrenchClaw public builds ship as a standalone compiled binary named `trenchclaw`.

- you do not need Bun for the release install path
- GitHub Releases is the install channel for public binaries
- writable runtime state lives outside the install tree

## Install The Release

Supported release targets today:

- `darwin-arm64`
- `linux-x64`
- `linux-arm64`

### macOS

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/macos-bootstrap.sh | bash
```

### Linux

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | bash
```

The installer:

- resolves the release version
- downloads the right bundle and checksum
- verifies the checksum before extraction
- installs the app under `~/.local/share/trenchclaw/<version>/`
- updates `~/.local/share/trenchclaw/current`
- writes the `trenchclaw` launcher into `~/.local/bin`

If you need to pin a specific release:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/macos-bootstrap.sh | TRENCHCLAW_VERSION=v0.0.0-beta.2 bash
```

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | TRENCHCLAW_VERSION=v0.0.0-beta.2 bash
```

## Launch TrenchClaw

Start the app with:

```bash
trenchclaw
```

The runtime stays local by default.

- runtime API: `127.0.0.1:4020`
- GUI: `127.0.0.1:4173`

If either port is occupied, TrenchClaw moves upward to the next available local port.

## Run `trenchclaw doctor`

After the first install, run:

```bash
trenchclaw doctor
```

`doctor` is the first thing to check when you are not sure what is missing. It reports:

- whether the app bundle is healthy
- whether the runtime state root is writable
- whether an active instance exists
- whether the active instance vault exists
- whether AI, Helius, and Jupiter keys are configured
- whether optional CLIs such as `solana` and `helius` are available

Run it again after you change keys, switch RPC setup, or install optional CLI tooling.

## Create Or Sign Into An Instance

On first launch, use the GUI to create an instance or sign into an existing one.

Creating an instance does the setup work you should not have to do by hand:

- allocates the next local instance id such as `01`
- writes the instance profile
- creates the instance directory
- creates the instance `vault.json`
- creates the instance `settings/trading.json`
- persists the active instance selection

Signing into an existing instance also ensures the instance layout exists before the rest of the app uses it.

Use the default `dangerous` profile only if you want trading paths available. If you are just inspecting the app, start conservatively.

## Add Keys In The Right Order

The easiest setup sequence is:

1. Set your AI key first so chat can work.
2. Leave RPC on a public Solana endpoint unless you specifically want Helius-backed reads.
3. Add a Helius key only when you want Helius as your private RPC or want swap history.
4. Add a Jupiter Ultra API key only when you are ready for swap or trigger-order workflows.

For the exact file model and all key locations, use [Keys and Settings](/docs/keys-and-settings).

## Test AI Connection

After you save your AI key:

1. Open the `Keys` panel.
2. Save `OpenRouter API Key`.
3. Open the AI settings panel.
4. Choose `OpenRouter`.
5. Choose `GPT-5.4`.
6. Save.
7. Click `Test AI connection`.

If the test fails, run `trenchclaw doctor` and confirm:

- an active instance exists
- the active instance vault exists
- at least one AI key is present
- the selected provider matches the key you actually saved

## Optional CLI Tools

Optional CLIs are not required for baseline launch.

Use the helper only if you want TrenchClaw to install or update those external tools for you:

```bash
curl -fsSL https://raw.githubusercontent.com/henryoman/trenchclaw/main/scripts/install-required-tools.sh | sh
```

Today that helper manages:

- `Solana CLI`
- `Helius CLI`

You can also install them directly:

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
```

```bash
bun add -g helius-cli@latest
```

Install them only when a shell workflow explicitly needs them.

## First Workflows To Try

Once the app is up and your AI connection passes:

1. Use chat or the runtime UI to confirm the runtime is responding.
2. Inspect the active instance and current readiness with `trenchclaw doctor`.
3. If you already have managed wallets in the active instance, use managed wallet reads.
4. Add Helius only if you want richer wallet reads or swap history.
5. Add Jupiter Ultra only if you are ready to test swaps or trigger orders.

For risky workflows, use devnet or small amounts first.

## Where Local State Lives

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

Writable state root for release installs:

```text
~/.trenchclaw/
  generated/
  runtime/
    vault.template.json
  instances/
    active-instance.json
    <id>/
      instance.json
      vault.json
      keypairs/
      settings/
        ai.json
        settings.json
        trading.json
      workspace/
      db/
        runtime.sqlite
        queue.sqlite
        sessions/
        memory/
      shell-home/
      tmp/
      tool-bin/
  protected/
    keypairs/
```

You do not need to create these files by hand. TrenchClaw creates the instance directories, vault file, settings files, workspace, and instance-local DB/shell directories for you and applies best-effort secure permissions as part of the app flow.

## Troubleshooting

### `trenchclaw: command not found`

Reload your shell, or add `~/.local/bin` to `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Then open a new shell and try again.

### Missing optional tools

First launch is not blocked by missing `solana`, `solana-keygen`, or `helius`. Install them only when a workflow asks for them, then rerun `trenchclaw doctor`.

### Download or checksum problems

If install fails, check:

- the GitHub Release exists
- the artifact for your platform exists
- the tag matches `TRENCHCLAW_VERSION` if you pinned one

Checksum mismatches should stop the install. Treat that as a release issue, not something to bypass locally.
