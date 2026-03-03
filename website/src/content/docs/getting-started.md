---
title: Getting Started
description: Complete local setup for TrenchClaw, including Bun, Solana CLI, wallet/RPC setup, vault secrets, and launch flows.
order: 1
---

# Getting Started

This guide covers a full first-time local setup for TrenchClaw. It includes everything you need that is not automatically bundled by JavaScript packages in `node_modules`.

## What You Need Outside `node_modules`

Before running the app, install and configure:

- Bun (`bun` runtime + package manager)
- Solana CLI (`solana` command line tools)
- A funded Solana wallet/keypair for your target cluster
- A Solana RPC endpoint (public or provider URL)
- At least one LLM API key in the local vault (for runtime AI features)

## 1. Install Bun (Required First)

Official Bun site: <https://bun.sh>

Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
```

Reload your shell, then verify:

```bash
bun --version
which bun
```

This repo currently expects Bun `1.3.x` (see root `package.json` `packageManager`).

## 2. Install Repository Dependencies

From repo root:

```bash
bun install
```

This installs all workspace package dependencies.

## 3. Install Solana CLI (Required)

Use Anza's installer script:

- Download/install link: <https://release.anza.xyz/v3.1.9/install>
- Install command:

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.9/install)"
```

After install, ensure Solana CLI is on `PATH` and verify:

```bash
solana --version
which solana
```

If `solana` is not found, add this to your shell profile (`~/.zshrc` or `~/.bashrc`) and reopen terminal:

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

## 4. Configure Solana Cluster + Wallet

Check current CLI config:

```bash
solana config get
```

Set cluster URL (choose one):

```bash
# Mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Devnet
solana config set --url https://api.devnet.solana.com
```

Create a new keypair (or point to an existing one):

```bash
solana-keygen new --outfile ~/.config/solana/id.json
solana config set --keypair ~/.config/solana/id.json
```

Verify wallet address:

```bash
solana address
```

Fund the wallet:

- Devnet testing:

```bash
solana airdrop 2
solana balance
```

- Mainnet: send SOL to this address from your funding source/wallet.

## 5. Configure TrenchClaw Secrets Vault

TrenchClaw stores sensitive config in:

- `apps/trenchclaw/src/ai/brain/protected/no-read/vault.json`

The runtime can auto-create this file from:

- `apps/trenchclaw/src/ai/brain/protected/no-read/vault.template.json`

You can pre-create it manually:

```bash
cp apps/trenchclaw/src/ai/brain/protected/no-read/vault.template.json \
  apps/trenchclaw/src/ai/brain/protected/no-read/vault.json
```

Minimum recommended fields to fill:

- `rpc.default.http-url`
- `llm.openrouter.api-key` or another provider key under `llm.*`

Lock down permissions (recommended on macOS/Linux):

```bash
chmod 700 apps/trenchclaw/src/ai/brain/protected/no-read
chmod 600 apps/trenchclaw/src/ai/brain/protected/no-read/vault.json
```

## 6. Optional App Download (Placeholder)

Desktop app download (placeholder for now):

- `<APP_DOWNLOAD_LINK_PLACEHOLDER>`

## 7. Run the Website Docs

From repo root:

```bash
bun run website:dev
```

This starts the website docs app in dev mode.

## 8. Run Runtime + GUI Together

From repo root:

```bash
bun run launch:dev
```

What this does:

- Boots the runtime server (`apps/trenchclaw`)
- Boots the GUI frontend (`apps/frontends/gui`)
- Auto-selects available ports if defaults are taken

Default ports (if available):

- Runtime: `4020`
- GUI: `4173`

## 9. Health Checks

Basic local verification checklist:

```bash
# Tooling
bun --version
solana --version

# Workspace install + code health
bun run lint
bun run typecheck
bun run test

# Build
bun run build
```

## 10. Common Issues and Fixes

### `solana: command not found`

- Add Solana install path to shell `PATH`:

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

- Reload shell and rerun `solana --version`.

### Runtime starts but actions fail immediately

- Confirm you set:
  - A valid RPC URL in `vault.json`
  - At least one valid LLM API key in `vault.json`
  - A funded wallet for your selected cluster

### Port already in use

- `launch:dev` already tries alternate ports.
- If you need fixed ports, set `RUNTIME_PORT` and `GUI_PORT` in env before launch.

## Command Quick Reference

- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`
- `bun run website:dev`
- `bun run launch:dev`
