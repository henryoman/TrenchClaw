# Helius CLI

Source snapshot: <https://www.helius.dev/docs/agents/cli>
Fetched: 2026-03-16

> Full-featured command-line interface for Helius. 95+ commands for account management, blockchain queries, transaction sending, webhooks, streaming, staking, and more. Designed for agents and automation.

The `helius` CLI is a full-featured command-line interface for the Helius platform. It provides 95+ commands for account management, blockchain data queries, transaction sending, webhooks, real-time streaming, staking, ZK Compression, and more, with machine-readable JSON output for every command.

Using an MCP-compatible AI tool? The Helius MCP server is still the recommended way for AI agents to interact with Helius. Use the CLI for shell scripts, CI/CD pipelines, or when MCP is not available.

## Installation

```bash
npm install -g helius-cli
```

## Quick Start - Existing Users

```bash
helius config set-api-key YOUR_API_KEY
```

## Quick Start - New Users

### Generate a keypair

```bash
helius keygen
```

Example output:

```text
✓ Keypair generated
Path: ~/.helius/keypair.json
Address: 7xKp...3nQm

To use this wallet, fund it with:
  • ~0.001 SOL for transaction fees
  • 1 USDC for Helius signup
```

### Fund the wallet

- SOL: `~0.001`
- USDC: `1+`

### Create account

```bash
helius signup
```

### Get API keys and endpoints

```bash
helius projects
helius apikeys <project-id>
helius rpc <project-id>
```

## Plans And Pricing

| Plan | Price | Credits | `--plan` value |
| --- | --- | --- | --- |
| Agent (Basic) | $1 one-time | 1,000,000 | `basic` |
| Developer | $49/mo | 10,000,000 | `developer` |
| Business | $499/mo | 100,000,000 | `business` |
| Professional | $999/mo | 200,000,000 | `professional` |

Signup examples:

```bash
# Default: Agent plan ($1)
helius signup

# Developer plan ($49/mo)
helius signup --plan developer --email you@example.com --first-name Jane --last-name Doe

# Yearly billing (paid plans only)
helius signup --plan business --period yearly --email you@example.com --first-name Jane --last-name Doe
```

Upgrade example:

```bash
helius upgrade --plan developer --email you@example.com --first-name Jane --last-name Doe
```

Renewal example:

```bash
helius pay <payment-intent-id>
```

## JSON Output Mode

```bash
helius projects --json
helius balance Gh9ZwEm... --json
helius asset owner 86xCnPe... --json
```

Example response:

```json
{
  "projects": [
    {
      "id": "67b9d260-726b-4ba3-8bb0-dbbf794641bf",
      "name": "My Project",
      "plan": "free"
    }
  ]
}
```

## Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | General error |
| 10 | Not logged in |
| 11 | Keypair not found |
| 20 | Insufficient SOL |
| 21 | Insufficient USDC |
| 30 | No projects found |
| 31 | Project not found |
| 40 | API error |

## Configuration

Official docs currently describe config under:

```text
~/.helius/
├── config.json
└── keypair.json
```

Config commands:

```bash
helius config show
helius config set-api-key <key>
helius config set-network devnet
helius config set-project <id>
helius config clear
```

API key resolution order documented by Helius:

1. `~/.helius/config.json`
2. `HELIUS_API_KEY`
3. `--api-key`

## Global Options

| Flag | Description |
| --- | --- |
| `--api-key` | Override the configured API key |
| `--network` | Override the network (`mainnet` or `devnet`) |
| `--json` | Output in JSON format |
| `-k, --keypair` | Path to keypair file |

## Full Agent Workflow

```bash
helius keygen
# Fund wallet externally with ~0.001 SOL + 1 USDC
helius signup
helius projects
helius apikeys <project-id>
helius rpc <project-id>
helius balance <address>
helius asset owner <wallet-address>
helius tx history <address> --limit 10
```

## Notes For TrenchClaw

- Keep this file as the official CLI guide snapshot.
- Cross-check config-path questions against `helius config show`, because the upstream README still documents `~/.helius-cli/`.
