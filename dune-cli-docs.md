# Dune CLI Command Reference

Source snapshot: `apps/trenchclaw/src/ai/brain/knowledge/skills/dune/*`
Compiled: 2026-03-23

This is the quick command map for the `dune` CLI.

## Fast Rules

- Prefer `-o json` on commands that support output formatting.
- Most commands require auth via `dune auth`, `DUNE_API_KEY`, or `--api-key`.
- `dune docs search` does not require auth.
- Treat `dune query create`, `dune query update`, and `dune query archive` as write operations.

## Auth And Basics

```bash
dune auth
dune auth --api-key <key>
dune --version
```

## Query Commands

### Saved Query Management

| Command | What it does |
| --- | --- |
| `dune query create --name <NAME> --sql <SQL> -o json` | Create a saved query |
| `dune query get <query-id> -o json` | Fetch saved query SQL and metadata |
| `dune query update <query-id> --sql <SQL> -o json` | Update a saved query |
| `dune query archive <query-id> -o json` | Archive a saved query |

### Query Execution

| Command | What it does |
| --- | --- |
| `dune query run <query-id> -o json` | Run a saved query and wait |
| `dune query run <query-id> --no-wait -o json` | Submit a saved query and return execution ID |
| `dune query run-sql --sql <SQL> -o json` | Run raw DuneSQL directly |
| `dune execution results <execution-id> -o json` | Fetch results for a prior execution |

Useful execution flags:

- `--param key=value`
- `--performance medium|large`
- `--limit <n>`
- `--offset <n>`
- `--no-wait`

## Dataset Discovery

| Command | What it does |
| --- | --- |
| `dune dataset search --query <TEXT> -o json` | Search datasets by keyword |
| `dune dataset search --query <TEXT> --include-schema -o json` | Search and include schema |
| `dune dataset search-by-contract --contract-address <ADDRESS> -o json` | Find decoded tables for a contract |
| `dune dataset search-by-contract --contract-address <ADDRESS> --include-schema -o json` | Contract search with schema |

Useful dataset flags:

- `--categories canonical|decoded|spell|community`
- `--blockchains <chain>`
- `--dataset-types <type>`
- `--schemas <namespace>`
- `--owner-scope all|me|team`
- `--include-private`
- `--include-schema`
- `--include-metadata`
- `--limit <n>`
- `--offset <n>`

## Docs And Usage

| Command | What it does |
| --- | --- |
| `dune docs search --query <TEXT> -o json` | Search official Dune docs |
| `dune docs search --query <TEXT> --api-reference-only -o json` | Bias toward API docs |
| `dune docs search --query <TEXT> --code-only -o json` | Bias toward code examples |
| `dune usage -o json` | Show account usage and credits |
| `dune usage --start-date YYYY-MM-DD --end-date YYYY-MM-DD -o json` | Usage over a date range |

## Good Everyday Commands

```bash
dune dataset search --query "uniswap swaps" --categories decoded --include-schema -o json
dune query run-sql --sql "SELECT block_number, block_time FROM ethereum.blocks ORDER BY block_number DESC LIMIT 5" -o json
dune docs search --query "DuneSQL functions" -o json
dune usage -o json
```

## Performance Reminders

- Always filter on partition columns.
- Common partition columns:
  - `block_time`
  - `block_date`
  - `evt_block_time`
  - `call_block_time`
- Use `--performance large` only when the query is genuinely heavy.

## Common Execution States

| State | Meaning |
| --- | --- |
| `QUERY_STATE_PENDING` | queued |
| `QUERY_STATE_EXECUTING` | running |
| `QUERY_STATE_COMPLETED` | results ready |
| `QUERY_STATE_FAILED` | query failed |
| `QUERY_STATE_CANCELLED` | query cancelled |

## Working Rules

- Prefer `query run-sql` for ad-hoc work.
- Prefer saved queries for reusable workflows.
- Use this file for fast command lookup and the skill references for deeper syntax details.
