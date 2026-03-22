# Jupiter AI Docs + API Quick Ops

Last verified: 2026-03-21

Use this file when the task involves Jupiter docs discovery, AI-agent integration,
or shell-first Jupiter API workflows. This is especially useful for `curl`/`jq`
flows because Jupiter exposes AI-friendly REST endpoints, raw markdown exports,
`llms.txt`, and an MCP server.

## Why This Matters

- Jupiter is explicitly built for AI-agent workflows.
- Basic usage does not require a Solana RPC node for the documented REST flows.
- Basic usage does not require an API key; Portal keys are optional for higher rate limits.
- The docs expose structured discovery surfaces that are good for shell tooling and local knowledge ingestion.

## Best Discovery Sources

Start with these before opening deeper docs:

- Docs index: `https://dev.jup.ag/llms.txt`
- Full-context docs: `https://dev.jup.ag/llms-full.txt`
- AI docs overview: `https://dev.jup.ag/ai/llms-txt`
- Jupiter MCP endpoint: `https://dev.jup.ag/mcp`

Use `llms.txt` for lightweight page discovery and routing.

Use `llms-full.txt` only when you need full-site context for indexing, RAG, or
deep reference lookups.

Use MCP when the editor or runtime can query documentation and OpenAPI schemas
directly.

## Markdown Export for Shell Workflows

Jupiter docs can be pulled as raw markdown, which is useful for bash commands,
local indexing, and agent-side ingestion.

Append `.md` to a docs URL:

```bash
curl -sS --fail https://dev.jup.ag/docs/ultra.md
curl -sS --fail https://dev.jup.ag/docs/ultra/get-started.md
```

Or request markdown via the `Accept` header:

```bash
curl -sS --fail -H "Accept: text/markdown" https://dev.jup.ag/docs/ultra
```

For shell scripts, prefer `curl -sS --fail` and pipe into `jq` only after
confirming the endpoint returns JSON.

## Jupiter MCP

Jupiter exposes a Mintlify-native MCP server:

```text
https://dev.jup.ag/mcp
```

What MCP gives an agent:

- documentation pages
- OpenAPI specs
- code examples
- error references

For Cursor-style config:

```json
{
  "mcpServers": {
    "jupiter": {
      "url": "https://dev.jup.ag/mcp"
    }
  }
}
```

Operational rule: prefer MCP for targeted in-editor doc queries, and prefer
`llms.txt` for broad discovery or batch indexing.

## Quick REST Commands

These are the high-value shell commands from Jupiter's AI docs.

Treat them as trusted operator or internal automation examples. For
model-triggered shell execution, prefer a lightweight isolated shell runtime
with allowlisted network access and execution limits.

Search for a token:

```bash
curl -sS --fail "https://lite-api.jup.ag/tokens/v2/search?query=SOL"
```

Get a price:

```bash
curl -sS --fail "https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112"
```

Get a swap quote/order:

```bash
curl -sS --fail "https://lite-api.jup.ag/ultra/v1/order?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=10000000&taker=yourWalletAddress"
```

Execute a signed swap:

```bash
curl -sS --fail "https://lite-api.jup.ag/ultra/v1/execute" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"signedTransaction":"signedTransaction","requestId":"requestId"}'
```

Important:

- `ultra/v1/order` returns the data needed for execution.
- `ultra/v1/execute` requires a locally signed transaction plus the `requestId`
  from the order response.
- Do not describe Jupiter as eliminating wallet signing; it eliminates the need
  for direct RPC handling in the basic documented flow.

## Shell Notes

- Prefer `jq` for JSON extraction in scripts.
- Prefer reading `llms.txt` first when you do not yet know the right Jupiter doc page.
- Prefer raw markdown export for one-page ingestion instead of scraping rendered HTML.
- Prefer REST endpoints for token search, pricing, and quote discovery before dropping to lower-level Solana tooling.

## Source Links

- AI overview: <https://github.com/jup-ag/docs/blob/main/ai/index.mdx>
- AI docs index: <https://dev.jup.ag/ai/llms-txt>
- Docs discovery index: <https://dev.jup.ag/llms.txt>
- Full docs context: <https://dev.jup.ag/llms-full.txt>
- MCP docs: <https://dev.jup.ag/ai/mcp>
