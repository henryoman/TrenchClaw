---
title: Beta Capabilities
description: The current release truth for what is reliable now, what is available but narrower, and what is still not part of the public beta story.
order: 3
featured: true
---

## Read This Page As Release Truth

This page is the public beta contract.

Use it to separate:

- workflows we are comfortable headlining now
- workflows that exist but are narrower or less proven
- workflows that are still not part of the public beta story

## Shipped And Reliable Now

### Local runtime and GUI

The app boots as a local runtime plus local GUI and keeps the runtime on loopback by default.

### Instance setup

Current beta supports:

- create instance
- sign into instance
- persist active instance
- instance-scoped vault and trading settings

### AI-backed chat workflows

Current beta supports:

- provider selection through AI settings
- OpenRouter and Vercel AI Gateway keys in the vault
- chat-driven runtime workflows after the AI connection passes

### Managed wallet reads

Current beta supports:

- `getManagedWalletContents`
- `getManagedWalletSolBalances`

This is the main wallet inspection surface today.

### Wallet management

Current beta supports:

- `createWalletGroupDirectory`
- `createWallets`
- `renameWallets`

The runtime and chat surfaces are stronger than the GUI here. The GUI does not yet provide a dedicated create or rename flow.

### Jupiter Ultra swap path

Current beta supports:

- `ultraQuoteSwap`
- `ultraExecuteSwap`
- `ultraSwap`
- `managedUltraSwap`

This is the main public swap path.

### Direct trigger-order flows

Current beta supports:

- `getTriggerOrders`
- `triggerOrder`
- `triggerCancelOrders`

These are available now, but they are not the main headline workflow for the beta.

### Queue and explicit scheduling

Current beta supports:

- `enqueueRuntimeJob`
- `manageRuntimeJob`
- `scheduleManagedUltraSwap`
- `actionSequence`

This is explicit queueing and scheduled work, not a broad autonomous strategy engine.

### Dexscreener research

Current beta supports market-data and research workflows such as:

- pair search
- pair lookup
- token lookup
- latest profiles
- boosts
- ads and related research surfaces

This is research tooling, not execution tooling.

## Available But Narrower Right Now

These surfaces exist and can be useful, but they are not as strong as the core beta paths above.

### Direct transfers

Available:

- `transfer`
- `closeTokenAccount`

Treat these as narrower beta surfaces than managed wallet reads or Ultra swaps.

### Swap history

Available:

- `getSwapHistory`

This depends on Helius enhanced transaction history. Use it when you need it, but do not treat it as one of the most battle-tested headline workflows yet.

### Managed trigger wrappers

Managed trigger wrappers exist, but the direct trigger path is the clearer public story right now.

## Current Limits You Should Know

- the runtime is meant to stay local
- no dedicated GUI wallet creation flow
- no dedicated GUI wallet rename flow
- no full runtime settings editor in the GUI
- many execution flows still rely on chat or runtime actions more than dedicated UI
- switching instances does not fully rebuild the live runtime policy engine, so a fresh boot is the safest assumption when profile changes matter

## Not Part Of The Public Beta Story

Do not present these as shipped beta features:

- broad autonomous strategy planners
- timer, price, or on-chain trigger automation beyond direct Jupiter Trigger order flows
- standard or raw RPC swap paths as the public supported swap surface
- privacy flows as a headline beta surface
- token creation and other repo-only utilities

Code may exist in the repo for some of these, but that is not the same as public support.

## What Each Capability Needs

### Baseline first launch

Needs:

- the app install
- a writable runtime state root

Does not need:

- Bun
- Solana CLI
- Helius CLI
- Helius key
- Jupiter Ultra key

### Chat-driven workflows

Needs:

- an active instance
- either `OpenRouter API Key` or `Vercel AI Gateway API Key`
- a matching provider selection in AI settings

### Helius-enriched reads and swap history

Needs:

- an active instance
- Helius configured through `Private RPC credential`

### Ultra swaps and trigger orders

Needs:

- an active instance
- `Jupiter Ultra API Key`
- trading enabled for the instance and workflow

### CLI-backed shell workflows

Needs, only when the workflow explicitly asks for them:

- `solana`
- `solana-keygen`
- `helius`

## Recommended Beta Posture

- install `trenchclaw`
- launch it locally
- create or sign into an instance
- set up AI first
- use `trenchclaw doctor` as the readiness check
- add Helius and Jupiter only when you want the workflows that actually need them
- use devnet or small amounts before trusting any dangerous execution path
