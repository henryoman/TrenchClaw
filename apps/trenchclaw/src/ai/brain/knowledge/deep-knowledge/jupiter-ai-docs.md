# Jupiter AI Docs + API Quick Ops

Last verified: 2026-03-23

Use this file when the task involves Jupiter docs discovery, AI-agent integration,
or shell-first Jupiter API workflows. This is especially useful for `curl`/`jq`
flows because Jupiter exposes AI-friendly REST endpoints, raw markdown exports,
`llms.txt`, and an MCP server.

## Current Product Posture

- For new swap work, prefer `Swap API V2` at `https://api.jup.ag/swap/v2`.
- Keep `Trigger V1` for non-JWT trigger orders when that is an explicit product choice.
- Treat `Ultra` as a compatibility surface: its concepts still appear in docs, but new swap integrations should move to `Swap API V2 /order + /execute`.
- All Jupiter API surfaces in normal production use require `x-api-key` from `portal.jup.ag`.

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
curl -sS --fail https://dev.jup.ag/docs/swap/v2/order-and-execute.md
curl -sS --fail https://dev.jup.ag/docs/trigger/v1/create-order.md
```

Or request markdown via the `Accept` header:

```bash
curl -sS --fail -H "Accept: text/markdown" https://dev.jup.ag/docs/swap/v2/order-and-execute
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

Search for a token:

```bash
curl -sS --fail -H "x-api-key: $JUPITER_API_KEY" \
  "https://api.jup.ag/tokens/v2/search?query=SOL"
```

Get a price:

```bash
curl -sS --fail -H "x-api-key: $JUPITER_API_KEY" \
  "https://api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112"
```

Get a managed swap order:

```bash
curl -sS --fail -H "x-api-key: $JUPITER_API_KEY" \
  "https://api.jup.ag/swap/v2/order?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=10000000&taker=yourWalletAddress"
```

Execute a signed managed swap:

```bash
curl -sS --fail "https://api.jup.ag/swap/v2/execute" \
  -X POST \
  -H "x-api-key: $JUPITER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"signedTransaction":"signedTransaction","requestId":"requestId"}'
```

Create a Trigger V1 order:

```bash
curl -sS --fail "https://api.jup.ag/trigger/v1/createOrder" \
  -X POST \
  -H "x-api-key: $JUPITER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"inputMint":"So11111111111111111111111111111111111111112","outputMint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","maker":"yourWalletAddress","payer":"yourWalletAddress","params":{"makingAmount":"10000000","takingAmount":"1700000"},"computeUnitPrice":"auto"}'
```

## Working Rules For TrenchClaw

- For swaps in this app, prefer `Swap API V2 /order + /execute`.
- Keep `Trigger V1` on `/trigger/v1/*` because the app intentionally avoids the JWT-based Trigger V2 flow.
- If a swap order returns no `transaction` but includes `errorCode` or `errorMessage`, surface that response directly instead of masking it with a generic parser error.
- Do not describe Jupiter as removing wallet signing. Jupiter manages routing and execution, but the client still signs.
- Prefer `@solana/kit` partial signing behavior when a Jupiter-managed swap can include additional downstream signatures.

## Shell Notes

- Prefer `jq` for JSON extraction in scripts.
- Prefer reading `llms.txt` first when you do not yet know the right Jupiter doc page.
- Prefer raw markdown export for one-page ingestion instead of scraping rendered HTML.
- Prefer REST endpoints for token search, pricing, quote discovery, and managed swap execution before dropping to lower-level Solana tooling.

## Source Links

- AI overview: <https://github.com/jup-ag/docs/blob/main/ai/index.mdx>
- AI docs index: <https://dev.jup.ag/ai/llms-txt>
- Docs discovery index: <https://dev.jup.ag/llms.txt>
- Full docs context: <https://dev.jup.ag/llms-full.txt>
- Swap API V2 order+execute: <https://dev.jup.ag/docs/swap/v2/order-and-execute>
- Trigger V1 create order: <https://dev.jup.ag/docs/trigger/v1/create-order>
- Trigger V1 cancel order: <https://dev.jup.ag/docs/trigger/v1/cancel-order>
- Trigger V1 get orders: <https://dev.jup.ag/docs/trigger/v1/get-trigger-orders>
- MCP docs: <https://dev.jup.ag/ai/mcp>
