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

Common flags for query management:

- `--name <NAME>`
- `--sql <SQL>`
- `--description <TEXT>`
- `--private`
- `--temp`
- `--tags a,b,c`
- `-o json`

### Query Execution

| Command | What it does |
| --- | --- |
| `dune query run <query-id> -o json` | Run a saved query and wait |
| `dune query run <query-id> --no-wait -o json` | Submit a saved query and return execution ID |
| `dune query run-sql --sql <SQL> -o json` | Run raw DuneSQL directly |
| `dune execution results <execution-id> -o json` | Fetch results for a prior execution |

Common execution flags:

- `--param key=value`
- `--performance medium|large`
- `--limit <n>`
- `--offset <n>`
- `--no-wait`
- `-o json`

## Dataset Discovery

| Command | What it does |
| --- | --- |
| `dune dataset search --query <TEXT> -o json` | Search datasets by keyword |
| `dune dataset search --query <TEXT> --include-schema -o json` | Search and include column schema |
| `dune dataset search-by-contract --contract-address <ADDRESS> -o json` | Find decoded tables for a contract |
| `dune dataset search-by-contract --contract-address <ADDRESS> --include-schema -o json` | Contract search with schema |

Useful dataset flags:

- `--query <TEXT>`
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
- `-o json`

## Docs And Usage

| Command | What it does |
| --- | --- |
| `dune docs search --query <TEXT> -o json` | Search official Dune docs |
| `dune docs search --query <TEXT> --api-reference-only -o json` | Bias toward API docs |
| `dune docs search --query <TEXT> --code-only -o json` | Bias toward code examples |
| `dune usage -o json` | Show account usage and credits |
| `dune usage --start-date YYYY-MM-DD --end-date YYYY-MM-DD -o json` | Usage over a date range |

## Best Command Patterns

### Run ad-hoc SQL

```bash
dune query run-sql --sql "SELECT block_number, block_time FROM ethereum.blocks ORDER BY block_number DESC LIMIT 5" -o json
```

### Run a saved query with params

```bash
dune query run 12345 --param wallet=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --param days=30 -o json
```

### Submit first, fetch later

```bash
dune query run 12345 --no-wait --performance large -o json
dune execution results 01ABC... -o json
```

### Find a table before writing SQL

```bash
dune dataset search --query "uniswap swaps" --categories decoded --include-schema -o json
```

### Find decoded tables for one contract

```bash
dune dataset search-by-contract --contract-address 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984 --include-schema -o json
```

### Search docs for syntax help

```bash
dune docs search --query "DuneSQL functions" -o json
```

## Performance Reminders

- Always filter on partition columns when writing SQL.
- Common partition columns:
  - `block_time`
  - `block_date`
  - `evt_block_time`
  - `call_block_time`
- Use `--performance large` only when the query is genuinely heavy.

## Common States

| State | Meaning |
| --- | --- |
| `QUERY_STATE_PENDING` | queued |
| `QUERY_STATE_EXECUTING` | running |
| `QUERY_STATE_COMPLETED` | results ready |
| `QUERY_STATE_FAILED` | query failed |
| `QUERY_STATE_CANCELLED` | query cancelled |

## Practical Command Families

| Family | Commands |
| --- | --- |
| Auth | `auth` |
| Saved queries | `query create`, `query get`, `query update`, `query archive` |
| Execution | `query run`, `query run-sql`, `execution results` |
| Discovery | `dataset search`, `dataset search-by-contract` |
| Docs | `docs search` |
| Account | `usage` |

## Safety Notes

- Do not expose API keys in terminal output or saved docs.
- Prefer `dune auth` or `DUNE_API_KEY` over passing `--api-key` directly.
- For throwaway work, prefer `query run-sql` or `query create --temp`.
- For reusable work, create a saved query and then run it by ID.

## Related References

- `apps/trenchclaw/src/ai/brain/knowledge/skills/dune/SKILL.md`
- `apps/trenchclaw/src/ai/brain/knowledge/skills/dune/references/query-management.md`
- `apps/trenchclaw/src/ai/brain/knowledge/skills/dune/references/query-execution.md`
- `apps/trenchclaw/src/ai/brain/knowledge/skills/dune/references/dataset-discovery.md`
- `apps/trenchclaw/src/ai/brain/knowledge/skills/dune/references/docs-and-usage.md`
- `apps/trenchclaw/src/ai/brain/knowledge/skills/dune/references/install-and-recovery.md`
