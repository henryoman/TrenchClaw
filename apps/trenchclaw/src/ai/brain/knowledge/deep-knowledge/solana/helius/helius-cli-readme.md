# Helius CLI Upstream README Snapshot

Source snapshot: <https://github.com/helius-labs/helius-cli>
Fetched: 2026-03-16

This file preserves the upstream repository README examples so the runtime model can reach for repo-authored usage patterns when the docs and the CLI repo diverge.

## Quick Start For Agents

```bash
# 1. Generate a keypair
helius keygen

# 2. Fund the wallet (shown in keygen output)
#    - ~0.001 SOL for transaction fees
#    - 1 USDC for signup

# 3. Create account + project
helius signup

# 4. Get your API keys
helius projects
helius apikeys <project-id>
```

## Installation

```bash
# Install globally via npm
npm install -g helius-cli

# Or with pnpm
pnpm add -g helius-cli
```

## Keypair Management

Generate a keypair:

```bash
helius keygen
```

Upstream README example output:

```text
✓ Keypair generated
Path: /home/user/.helius-cli/keypair.json
Address: 7xKp...3nQm

To use this wallet, fund it with:
  • ~0.001 SOL for transaction fees
  • 1 USDC for Helius signup
```

Override keypair path:

```bash
helius login -k /path/to/other/keypair.json
```

Missing keypair example:

```text
Error: Keypair not found at /home/user/.helius-cli/keypair.json
Run `helius keygen` to generate a keypair first.
```

## Signup Flow

Requirements:

| Asset | Amount | Purpose |
| --- | --- | --- |
| SOL | ~0.001 | Transaction fees + rent |
| USDC | 1.00 | Helius signup payment |

Process:

```bash
helius signup
```

Documented upstream behavior:

1. Checks SOL balance
2. Checks USDC balance
3. Sends 1 USDC payment
4. Creates account and project
5. Returns project ID and API key

Insufficient balance examples:

```text
✖ Insufficient SOL for transaction fees
Have: 0.000000 SOL
Need: ~0.001 SOL

Send SOL to: 7xKp...3nQm
```

```text
✖ Insufficient USDC
Have: 0.00 USDC
Need: 1 USDC

Send USDC to: 7xKp...3nQm
```

## JSON Output

```bash
helius projects --json
helius apikeys <project-id> --json
helius rpc <project-id> --json
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

## Config Layout In README

The upstream README currently documents:

```text
~/.helius-cli/
├── config.json
└── keypair.json
```

Use this snapshot together with `helius-cli.md`, because the official CLI docs currently document `~/.helius/` instead.

## Full Agent Workflow

```bash
# Step 1: Check if keypair exists
helius login

# Step 2: Generate keypair
helius keygen

# Step 3: Fund wallet externally
# Send 0.001 SOL + 1 USDC to the address

# Step 4: Create account
helius signup

# Step 5: Get API keys
helius projects
helius apikeys 67b9d260-726b-4ba3-8bb0-dbbf794641bf

# Step 6: Get RPC endpoints
helius rpc 67b9d260-726b-4ba3-8bb0-dbbf794641bf
```

## Development Notes

The upstream repo documents local development with:

```bash
git clone https://github.com/helius-labs/helius-cli
cd helius-cli
pnpm install
pnpm dev keygen
pnpm dev signup
pnpm dev projects
pnpm build
```
