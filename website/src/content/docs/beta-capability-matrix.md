---
title: Beta Capability Matrix
description: Source-of-truth list of what the current beta actually ships, what is coming soon, and what is still internal-only.
order: 7
---

## How To Read This

This page is the current release audit for the public beta.

- `Shipped now` means the surface is runtime-exposed and has strong code or test evidence.
- `Coming soon` means the surface exists in code or docs but is not proven enough to headline yet.
- `Internal-only` means code exists in the repo, but it is not part of the public runtime capability surface.

## Shipped Now

| Surface | Actual tools or actions | Requirements | Beta note |
| --- | --- | --- | --- |
| Managed wallet reads | `getManagedWalletContents`, `getManagedWalletSolBalances` | active instance, RPC configured | Main wallet inspection surface today |
| Wallet management | `createWalletGroupDirectory`, `createWallets`, `renameWallets` | wallet creation or update permissions | GUI is partial, chat and runtime surface are stronger |
| Dexscreener market research | latest profiles, boosts, ads, pair search, pair lookup, token lookups | trading enabled, Dexscreener enabled | Research only, not execution |
| Runtime and chat workflows | `queryRuntimeStore`, `pingRuntime`, chat tool routing | AI key for chat-driven flows | Core operator workflow is real and tested |
| Jupiter Ultra swaps | `ultraQuoteSwap`, `ultraExecuteSwap`, `ultraSwap`, `managedUltraSwap` | Jupiter Ultra API key, trading enabled, confirmation settings | Main shipped swap path |
| Trigger orders | `getTriggerOrders`, `triggerOrder`, `triggerCancelOrders` | Jupiter Ultra API key, trigger settings enabled | Supported, but not the headline beta message |
| Queue and simple scheduling | `enqueueRuntimeJob`, `manageRuntimeJob`, `scheduleManagedUltraSwap`, `actionSequence` | runtime queue enabled | Useful for explicit queued work, not a full strategy engine |

## Coming Soon

| Surface | Current state | Why it is not a headline beta feature yet |
| --- | --- | --- |
| Direct transfers | `transfer` and `closeTokenAccount` are runtime-exposed | Wiring exists, but proof is weaker than wallet reads or Ultra swaps |
| Privacy flows | `privacyTransfer`, `privacyAirdrop`, `privacySwap` exist | Present in runtime, but not strongly proven for public beta |
| Swap history | `getSwapHistory` exists and depends on Helius | Useful, but evidence is thinner than the main shipped surfaces |
| Managed trigger wrappers | managed trigger order wrappers exist | Direct trigger path is clearer and better proven |
| Broad automation language | repo contains strategy and trigger concepts | Public beta is not a broad autonomous strategy engine yet |

## Internal-Only Or Not Publicly Exposed

| Surface | Current state |
| --- | --- |
| Standard or RPC swap path | Repo code exists, but it is not the public supported swap surface |
| Vanity wallet helper | Uses `solana-keygen`, but it is not part of the public runtime capability catalog |
| Token creation and other repo utilities | Code exists, but not exposed through the audited beta runtime surface |

## CLI And Key Matrix

| Dependency | Needed for baseline first launch | Needed for shipped beta features | Needed for optional shell or power-user workflows |
| --- | --- | --- | --- |
| `Helius CLI` | no | no | yes |
| `Solana CLI` | no | no | yes |
| `solana-keygen` | no | no | yes |
| Helius RPC credential or API key | no | yes for Helius-backed reads and swap history | yes |
| Jupiter Ultra API key | no | yes for Ultra swaps and trigger orders | yes |
| OpenRouter or Gateway key | no | yes for chat-driven workflows | yes |

## What We Are Telling Beta Users

- Install `trenchclaw` first.
- Add keys and RPC credentials for the features you actually want to use.
- Install `Helius CLI` and `Solana CLI` only when a workflow explicitly asks for them.
- If a requested workflow depends on a missing CLI or key, `trenchclaw doctor` should be the first place to check.
