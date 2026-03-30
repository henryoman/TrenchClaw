# Wallet Trade History RPC Research

Date: 2026-03-30

## Goal

Figure out which additional RPC-backed action surfaces we should expose for easy wallet activity reads, especially:

- recent trades for a wallet
- token and asset metadata attached to those trades
- correct placement in the current TrenchClaw action/tool structure
- a small, low-risk first implementation slice

## Executive Summary

Do not use DAS as the primary source for recent wallet trades.

Use:

- Helius Enhanced Transactions as the primary source for wallet trade history
- Helius DAS as the metadata and asset-enrichment layer

That split matches the product need and also matches how the repo is already structured:

- `getSwapHistory` already uses Helius enhanced transaction history
- `getManagedWalletContents` already uses Helius DAS for wallet inventory and token metadata when Helius is the selected private RPC

The smallest good next surface is a new `getWalletTradeHistory` action that:

- reads wallet trade history from Helius Enhanced Transactions
- optionally enriches unique mint addresses with DAS `getAssetBatch`
- lives in the current `apps/trenchclaw/src/tools/**` action surface
- is registered through the existing runtime tool registry and snapshot layers

## Recommended API Split

### Primary Source For Recent Trades

Use Helius Enhanced Transactions.

Why:

- It is built for parsed wallet transaction history.
- It supports address history and transaction type filtering.
- It already gives human-readable transaction structure for swaps, transfers, and DeFi activity.
- It avoids rebuilding trade classification from raw Solana RPC responses.

Best fit for:

- recent swaps
- recent transfers
- recent wallet activity with parsed semantics
- UI/chat-ready activity feeds

### Metadata Enrichment

Use Helius DAS.

Why:

- DAS is strong for asset ownership, fungible metadata, NFT metadata, images, symbols, names, and pricing fields exposed through asset responses.
- DAS fits naturally as a second-step enrichment layer for mint addresses found in trade history.

Best fit for:

- token name
- token symbol
- image URL
- fungible token metadata
- NFT / compressed NFT metadata
- optional pricing fields when available in asset responses

### Fallback / Lower-Level Read Path

Use raw Solana RPC only as fallback or for narrower supporting reads.

Relevant raw methods:

- `getSignaturesForAddress`
- `getTransaction`
- `getTokenAccountsByOwner`

But raw RPC should not be the first choice for wallet trade history because it pushes too much parsing burden into the runtime and has weaker associated-token-account coverage for this use case.

## Why DAS Should Not Be The Primary Trade History API

DAS is not the right primary source for "show me recent trades for this wallet."

Reasons:

- DAS is asset-centric, not transaction-history-centric.
- The main DAS methods are better at inventory and metadata than wallet activity history.
- You still need a transaction-history source to identify what happened and in what order.

Conclusion:

- DAS should enrich trade history
- DAS should not replace trade history

## Why Raw `getSignaturesForAddress` Should Not Be The First Surface

Raw `getSignaturesForAddress` is useful, but not ideal as the primary product surface for this feature.

Reasons:

- It returns signatures, not parsed trades.
- You still need follow-up `getTransaction` calls and custom decoding.
- Helius documents note that `getSignaturesForAddress` does not include transactions involving associated token accounts.

Conclusion:

- raw RPC is a fallback path
- Helius enhanced history is the correct first product surface

## Current Repo Findings

### Current Action Layout

The active runtime action surface lives under:

- `apps/trenchclaw/src/tools/**`

This is the current source of truth for actions exposed through runtime bootstrap and the tool catalog.

The older `solana/actions/...` references found in repo knowledge docs are historical and should not be treated as the current implementation location.

### Existing Wallet Inventory Pattern

Managed wallet inventory already prefers Helius DAS when Helius is the selected private RPC.

Relevant files:

- `apps/trenchclaw/src/tools/wallet/getManagedWalletContents.ts`
- `apps/trenchclaw/src/solana/lib/rpc/helius.ts`
- `tests/solana/actions/data-based/getManagedWalletContents.test.ts`

Important existing behavior:

- resolves Helius API key and selected provider from vault / context
- prefers Helius DAS when available
- falls back to raw RPC when DAS is unavailable or rate-limited
- already maps fungible metadata like symbol, name, image, and USD value fields

This is the correct implementation pattern to copy for metadata enrichment.

### Existing Trade History Pattern

There is already a narrow trade-history surface:

- `apps/trenchclaw/src/tools/trading/swapHistory.ts`

Current behavior:

- uses `helius.enhanced.getTransactionsByAddress`
- filters to `type: "SWAP"`
- returns only recent swaps
- maps a limited subset of transaction fields
- does not provide a broader wallet activity history surface
- does not do a separate DAS enrichment pass

This means the repo already has the right foundation, but not yet the broader and cleaner wallet-trade-history tool.

### Exposure Path In The Runtime

Action exposure currently runs through:

- `apps/trenchclaw/src/tools/registry.ts`
- `apps/trenchclaw/src/tools/snapshot.ts`
- `apps/trenchclaw/src/runtime/bootstrap.ts`

For a new action to be available properly, it should:

1. live under `apps/trenchclaw/src/tools/...`
2. be exported through the relevant `index.ts`
3. be added to `apps/trenchclaw/src/tools/registry.ts`
4. be included in `apps/trenchclaw/src/tools/snapshot.ts` if it should be routed in operator chat / RPC data fetch grouping

## Recommended New Surface

### First New Action

Add:

- `getWalletTradeHistory`

Suggested behavior:

- input:
  - `walletAddress`
  - `limit`
  - optional `types`
  - optional `beforeSignature`
  - optional `includeMetadata`
- backend:
  - Helius Enhanced Transactions as primary history source
- enrichment:
  - collect unique mint addresses from the returned events
  - optionally resolve metadata via DAS `getAssetBatch`

Suggested default use case:

- "show me recent trades for this wallet with metadata"

### Why Not Just Extend `getSwapHistory` In Place

`getSwapHistory` is useful, but it is narrow by design.

It currently implies:

- swap-only semantics
- a limited return shape
- a trading-specific placement and description

A sibling action is cleaner because:

- it can cover more than swaps
- it can keep `getSwapHistory` stable
- `getSwapHistory` can later become a thin wrapper around a shared helper if desired

## Recommended Implementation Order

### Phase 1

Implement only:

- `getWalletTradeHistory`

Scope:

- Helius Enhanced Transactions history fetch
- `SWAP` default support
- optional DAS enrichment for involved mints
- tests for happy path, missing key, pagination, and degraded behavior

### Phase 2

After the first action is stable, consider:

- `getWalletTransferHistory`
- broader `types` coverage in `getWalletTradeHistory`
- reuseable internal DAS enrichment helper

### Phase 3

Only later, if it proves valuable:

- Wallet API identity lookup
- Wallet API funding-source lookup
- Wallet API transfer-history lookup

Reason to defer:

- Helius Wallet API is still beta
- it is better as a later enhancement than as the first runtime contract here

## Recommended File Placement

### New Action File

Recommended location:

- `apps/trenchclaw/src/tools/trading/getWalletTradeHistory.ts`

Rationale:

- it belongs with other trade-history / transaction-history reads
- it is a data-based wallet-activity read, not wallet execution
- it stays close to the existing `swapHistory.ts`

### Exports

Update:

- `apps/trenchclaw/src/tools/trading/index.ts`

### Registry Exposure

Update:

- `apps/trenchclaw/src/tools/registry.ts`

Add:

- release-readiness entry
- tool definition
- example input
- tags / routing hint

### Snapshot Routing

Update:

- `apps/trenchclaw/src/tools/snapshot.ts`

Add it to:

- operator-routed tool names
- RPC data fetch grouping if that grouping is still the desired UI bucket

### Tests

Recommended test file:

- `tests/solana/actions/data-based/getWalletTradeHistory.test.ts`

Use the existing managed-wallet-contents tests as the structural template for:

- Helius selection
- mocked fetch / API responses
- fallback expectations
- metadata assertions

## Concrete Behavior Recommendation

### Input Shape

Suggested initial input:

```json
{
  "walletAddress": "9xQeWvG816bUx9EPfK5Yw9s6o1tuVd7a3mZ9zNnV3xF",
  "limit": 20,
  "types": ["SWAP"],
  "includeMetadata": true
}
```

### Output Shape

Suggested initial output should include:

- wallet address
- returned item count
- signatures
- timestamp fields
- transaction type
- source / protocol
- fee
- token input/output summary
- unique mint metadata when available
- clear indication of enrichment source

Important design point:

- keep the output compact and chat-friendly
- avoid exposing raw Helius payloads directly as the public contract

## Tests To Add When We Implement

### Required Tests

- uses Helius enhanced transaction history for recent wallet trades
- enriches unique mint addresses with DAS `getAssetBatch`
- returns metadata when enrichment succeeds
- still returns trade history when metadata enrichment fails
- returns a clear error when Helius API key is missing
- respects `beforeSignature` pagination
- handles rate limits or temporary failures cleanly

### Good Pattern To Copy

Use the test style from:

- `tests/solana/actions/data-based/getManagedWalletContents.test.ts`

That file already demonstrates:

- instance-scoped vault setup
- mocked Helius RPC requests
- metadata assertions
- fallback behavior when DAS is rate-limited

## Repo References

### Existing Narrow Swap History

- `apps/trenchclaw/src/tools/trading/swapHistory.ts`

### Existing DAS Wallet Inventory Pattern

- `apps/trenchclaw/src/tools/wallet/getManagedWalletContents.ts`

### Helius RPC Selection Helper

- `apps/trenchclaw/src/solana/lib/rpc/helius.ts`

### Runtime Tool Registry

- `apps/trenchclaw/src/tools/registry.ts`

### Tool Snapshot / Routing

- `apps/trenchclaw/src/tools/snapshot.ts`

### Good Existing DAS Test Pattern

- `tests/solana/actions/data-based/getManagedWalletContents.test.ts`

## Final Recommendation

The next RPC-backed read surface should be:

- `getWalletTradeHistory`

Use:

- Helius Enhanced Transactions for the actual wallet trade history
- Helius DAS `getAssetBatch` for mint metadata enrichment

Do not use:

- DAS as the primary trade-history API
- raw `getSignaturesForAddress` as the main product surface

Keep the first slice small:

- one new read-only action
- one clean public output shape
- one targeted test file
- no broad refactor

## External Sources

- Helius Enhanced Transactions overview: https://www.helius.dev/docs/enhanced-transactions/overview
- Helius `getTransactionsForAddress`: https://www.helius.dev/docs/api-reference/rpc/http/gettransactionsforaddress
- Helius DAS `getAssetsByOwner`: https://www.helius.dev/docs/api-reference/das/getassetsbyowner
- Helius DAS `getAssetBatch`: https://www.helius.dev/docs/api-reference/das/getassetbatch
- Helius `getSignaturesForAddress` guide: https://www.helius.dev/docs/rpc/guides/getsignaturesforaddress
- Helius Wallet API overview: https://www.helius.dev/docs/wallet-api/overview

