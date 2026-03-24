# Command Map

Use this file when you need the shortest possible routing map before opening
deeper docs.

## Start Here

- current runtime state, jobs, or older chat context
  - use `queryRuntimeStore`
- wallet balances or holdings
  - use `getManagedWalletSolBalances` or `getManagedWalletContents`
- swap or trigger order
  - open `swap` or `trigger-orders`
- wallet creation, naming, or transfer
  - open `wallets`
- news, sentiment, holder, or pair discovery
  - open `news`
- shell commands or CLI help
  - open `bash`
- runtime folder layout or path meaning
  - open `instance-folder`

## Read Live Runtime State

- `queryRuntimeStore`
  - use for jobs, schedules, stored conversation history, background work, and
    runtime state
- `queryInstanceMemory`
  - use for compact saved memory state

## Read Wallets And Market Data

- `getManagedWalletContents`
  - use for wallet balances, holdings, token inventory
- `getManagedWalletSolBalances`
  - use for SOL balances across managed wallets
- `getSwapHistory`
  - use for recent swap activity
- market/news tools
  - use Dexscreener/news/sentiment/holder tools for current external data

## Swap And Trading Actions

- `managedSwap`
  - default swap action for normal user swap requests
- `managedTriggerOrder`
  - use for trigger or limit orders
- `managedTriggerCancelOrders`
  - use to cancel trigger orders after reading exact ids
- `scheduleManagedSwap`
  - use for delayed swaps or simple recurring plans

## Workspace Tools

- `workspaceListDirectory`
  - use when path is unknown
- `workspaceReadFile`
  - use when path is known exactly
- `workspaceWriteFile`
  - use for exact allowed file creation or replacement
- `workspaceBash`
  - use only for real shell or CLI work
  - prefer typed modes like `cli`, `version`, `help`, `which`, `search_text`,
    `list_directory`, and `http_get`

## Knowledge Tools

- `listKnowledgeDocs`
  - use to search the indexed markdown/text knowledge surface
- `readKnowledgeDoc`
  - use when you already know the alias or exact doc name

## Quick Routing Rules

- prefer live tools over docs when the user wants current truth
- prefer the smallest tool that can finish the task
- read before write when a read removes ambiguity
- use `workspaceBash` for CLI execution, not for browsing docs
