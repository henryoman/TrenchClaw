# Jupiter AI Docs + API Quick Ops

Swap guidance verified: 2026-10-08

Use this file when the task involves Jupiter docs discovery, AI-agent integration,
or shell-first Jupiter API workflows. This is especially useful for `curl`/`jq`
flows because Jupiter exposes AI-friendly REST endpoints, raw markdown exports,
`llms.txt`, and an MCP server.

## Why This Matters

- Jupiter is explicitly built for AI-agent workflows.
- Basic usage does not require a Solana RPC node for the documented REST flows.
- TrenchClaw reads the Jupiter Portal API key from the active instance vault at `integrations/jupiter/api-key`; it sends the key in `x-api-key`.
- The docs expose structured discovery surfaces that are good for shell tooling and local knowledge ingestion.

## Best Discovery Sources

Start with these before opening deeper docs:

- Docs index: `https://developers.jup.ag/docs/llms.txt`
- Full-context docs: `https://developers.jup.ag/docs/llms-full.txt`
- AI docs overview: `https://developers.jup.ag/docs/ai/llms-txt`
- Jupiter MCP endpoint: `https://developers.jup.ag/docs/mcp`

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
curl -sS --fail https://developers.jup.ag/docs/swap.md
curl -sS --fail https://developers.jup.ag/docs/swap/order-and-execute.md
```

Or request markdown via the `Accept` header:

```bash
curl -sS --fail -H "Accept: text/markdown" https://developers.jup.ag/docs/swap
```

For shell scripts, prefer `curl -sS --fail` and pipe into `jq` only after
confirming the endpoint returns JSON.

## Jupiter MCP

Jupiter exposes a Mintlify-native MCP server:

```text
https://developers.jup.ag/docs/mcp
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
      "url": "https://developers.jup.ag/docs/mcp"
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
curl -sS --fail -H "x-api-key: YOUR_JUPITER_API_KEY" "https://api.jup.ag/tokens/v2/search?query=SOL"
```

Get a price:

```bash
curl -sS --fail -H "x-api-key: YOUR_JUPITER_API_KEY" "https://api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112"
```

Get a swap quote/order:

```bash
curl -sS --fail -H "x-api-key: YOUR_JUPITER_API_KEY" "https://api.jup.ag/swap/v2/order?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=10000000&taker=yourWalletAddress"
```

Execute a signed swap:

```bash
curl -sS --fail "https://api.jup.ag/swap/v2/execute" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_JUPITER_API_KEY" \
  -d '{"signedTransaction":"signedTransaction","requestId":"requestId"}'
```

Important:

- The saved `ultra` provider uses Swap V2 `/order` and `/execute`. Use `managedSwap` with `provider: "configured"` for the normal runtime flow.
- Sign with Solana Kit's `partiallySignTransaction`: JupiterZ adds its market maker signature during `/execute`. Preserve the quoted transaction message.
- Optional `referralAccount` and `referralFee` collect integrator fees after referral accounts are initialized. `referralFee` is in basis points. No referral fee is added by default.

- `swap/v2/order` returns the data needed for execution.
- `swap/v2/execute` requires a locally signed transaction plus the `requestId`
  from the order response.
- Do not describe Jupiter as eliminating wallet signing; it eliminates the need
  for direct RPC handling in the basic documented flow.

## Trigger Orders

The runtime uses `/trigger/v1` for noncustodial create, execute, cancel, and order history. Jupiter still supports V1 with no scheduled deprecation. Trigger V2 is the newest service, but introduces Privy-managed custodial vaults, challenge/JWT authentication, and USD-price triggers. Integrate it as a separate product flow; changing the URL breaks the existing contract. See <https://developers.jup.ag/docs/trigger>.

## Shell Notes

- Prefer `jq` for JSON extraction in scripts.
- Prefer reading `llms.txt` first when you do not yet know the right Jupiter doc page.
- Prefer raw markdown export for one-page ingestion instead of scraping rendered HTML.
- Prefer REST endpoints for token search, pricing, and quote discovery before dropping to lower-level Solana tooling.

## Source Links

- AI overview: <https://github.com/jup-ag/docs/blob/main/ai/index.mdx>
- AI docs index: <https://developers.jup.ag/docs/ai/llms-txt>
- Docs discovery index: <https://developers.jup.ag/docs/llms.txt>
- Full docs context: <https://developers.jup.ag/docs/llms-full.txt>
- MCP docs: <https://developers.jup.ag/docs/ai/mcp>

- Managed swap migration: <https://developers.jup.ag/docs/swap/migration/ultra-to-order>
- Managed swap execution and fees: <https://developers.jup.ag/docs/swap/order-and-execute>
