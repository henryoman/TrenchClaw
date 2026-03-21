# Helius CLI Reference

## What This Covers

Use this file when the user is asking about the `helius` terminal binary itself: installation, config, onboarding, JSON output, exit codes, or which command family to use.

## Install Paths

Official install commands:

```bash
bun add -g helius-cli@latest
# or
pnpm add -g helius-cli@latest
```

TrenchClaw helper-managed install:

```bash
./scripts/install-required-tools.sh
```

That helper installs or updates `helius-cli` when `bun` or `pnpm` is present in a TrenchClaw source checkout.

## Quick Start

Existing API key:

```bash
helius config set-api-key YOUR_API_KEY
helius config show
```

New signup:

```bash
helius keygen
# Fund the printed wallet with ~0.001 SOL and 1+ USDC
helius signup --json
helius projects --json
helius apikeys <project-id> --json
helius rpc <project-id> --json
```

## Best Practices

- Prefer `--json` for scripts, agents, and machine-readable output.
- Use the CLI for shell workflows, CI, and operator debugging.
- Prefer Helius MCP for structured agent tooling when MCP is available.
- Use `helius config show` before guessing the active network, API key source, or default project.

## Command Families

| Area | Commands |
| --- | --- |
| account setup | `helius keygen`, `helius signup`, `helius login`, `helius upgrade`, `helius pay` |
| projects and keys | `helius projects`, `helius project`, `helius apikeys`, `helius usage`, `helius rpc` |
| config | `helius config show`, `helius config set-api-key`, `helius config set-network`, `helius config set-project`, `helius config clear` |
| balances and tokens | `helius balance`, `helius tokens`, `helius token-holders` |
| transactions | `helius tx parse`, `helius tx history`, `helius tx fees` |
| DAS | `helius asset get`, `helius asset owner`, `helius asset search`, `helius asset token-accounts` |
| wallet API | `helius wallet identity`, `helius wallet balances`, `helius wallet history`, `helius wallet transfers`, `helius wallet funded-by` |
| webhooks | `helius webhook list`, `helius webhook create`, `helius webhook update`, `helius webhook delete` |
| sending | `helius send broadcast`, `helius send raw`, `helius send sender`, `helius send poll`, `helius send compute-units` |
| websockets | `helius ws account`, `helius ws logs`, `helius ws slot`, `helius ws signature`, `helius ws program` |
| program accounts | `helius program accounts`, `helius program accounts-all`, `helius program token-accounts` |
| staking | `helius stake create`, `helius stake unstake`, `helius stake withdraw`, `helius stake accounts` |
| zk compression | `helius zk ...` command family |
| Solana docs | `helius simd list`, `helius simd get` |

## Important Examples

```bash
helius balance <address> --json
helius asset owner <wallet-address> --limit 100 --json
helius wallet balances <wallet-address> --json
helius tx history <address> --limit 10 --json
helius webhook list --json
```

## Exit Codes

- `0`: success
- `1`: general error
- `10`: not logged in
- `11`: keypair not found
- `20`: insufficient SOL
- `21`: insufficient USDC
- `30`: no projects found
- `31`: project not found
- `40`: API error

## Config Path Caveat

The official Helius CLI docs currently describe config under `~/.helius/`, while the upstream CLI README still documents `~/.helius-cli/`. If the exact on-disk path matters for debugging, verify it against the installed binary instead of assuming one layout.

## Read Next

- `references/onboarding.md` for account creation and plan flows
- `../../deep-knowledge/solana/helius/helius-cli.md` for the full CLI guide snapshot
- `../../deep-knowledge/solana/helius/helius-cli-commands.md` for the full command catalog
- `../../deep-knowledge/solana/helius/helius-cli-readme.md` for upstream repo examples
