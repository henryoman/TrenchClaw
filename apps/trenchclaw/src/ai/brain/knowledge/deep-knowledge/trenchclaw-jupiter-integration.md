# TrenchClaw Jupiter Integration Guide

Last verified: 2026-03-23

This document is the app-specific guide for how TrenchClaw uses Jupiter today,
how the model should route swap and trigger requests, and where the important
implementation seams live.

## Current Architecture

- Main swap path: `Jupiter Swap API V2` through `GET /swap/v2/order` and `POST /swap/v2/execute`.
- Legacy compatibility path: `Ultra` surfaces remain in the codebase and tool names, but the recommended path for real swaps is now Swap API V2.
- Trigger orders: stay on `Trigger V1` because this app intentionally does not adopt the JWT-based Trigger V2 flow.
- Managed wallets: filesystem-managed keypairs are loaded and transactions are signed locally.
- Signing stack: use `@solana/kit` and related Solana kit/transactions packages, not `web3.js`.

## Important Files

- Swap V2 adapter: `apps/trenchclaw/src/solana/lib/adapters/jupiter.ts`
- Trigger V1 adapter: `apps/trenchclaw/src/solana/lib/adapters/jupiter-trigger.ts`
- Legacy Ultra adapter: `apps/trenchclaw/src/solana/lib/adapters/jupiter-ultra.ts`
- Managed swap action: `apps/trenchclaw/src/solana/actions/wallet-based/swap/managedSwap.ts`
- Managed Swap V2 execution path: `apps/trenchclaw/src/solana/actions/wallet-based/swap/rpc/executeSwap.ts`
- Managed Swap V2 quote path: `apps/trenchclaw/src/solana/actions/wallet-based/swap/rpc/quoteSwap.ts`
- Trigger order creation: `apps/trenchclaw/src/solana/actions/wallet-based/swap/trigger/createOrder.ts`
- Trigger order reads: `apps/trenchclaw/src/solana/actions/wallet-based/swap/trigger/getOrders.ts`
- Trigger order cancellation: `apps/trenchclaw/src/solana/actions/wallet-based/swap/trigger/cancelOrders.ts`
- Managed wallet signer: `apps/trenchclaw/src/solana/lib/wallet/wallet-signer.ts`
- Base signer implementation: `apps/trenchclaw/src/solana/lib/adapters/ultra-signer.ts`
- Operator prompt guidance: `apps/trenchclaw/src/ai/gateway/operator-prompt.ts`
- Capability catalog: `apps/trenchclaw/src/runtime/capabilities/action-definitions.ts`

## How The Model Should Route Requests

### Swaps

- Prefer `managedSwap` for normal user requests like "swap 0.2 SOL to JUP".
- Let provider selection default to configured behavior unless the user explicitly asks for a specific provider surface.
- Treat Swap API V2 as the primary path for immediate managed swaps.
- Use the legacy `managedUltraSwap` surface only when the user explicitly wants the old Ultra-specific path or when testing compatibility.

### Trigger Orders

- Prefer `managedTriggerOrder` when the user explicitly asks to place a trigger or limit order.
- Prefer `trigger.kind = "exactPrice"` for direct target-price requests.
- Use `percentFromBuyPrice` only when the user explicitly frames the request relative to entry price, stop loss, or take profit percentage.
- After success, tell the user the order can be tracked with `getTriggerOrders` using `orderStatus = "active"`.

### Schedules And Routines

- Prefer `scheduleManagedSwap` for normal delayed swaps and simple DCA plans.
- Keep `scheduleManagedUltraSwap` only as a legacy Ultra-only scheduling surface.
- Prefer `submitTradingRoutine` only when the user needs a richer multi-step trading workflow that does not fit the flatter scheduling schema.

## Managed Swap V2 Flow

1. Resolve managed wallet selection.
2. Load signer from the filesystem wallet library.
3. Normalize token aliases to mint addresses.
4. Convert UI or percent amounts into raw native amounts.
5. Request `GET /swap/v2/order`.
6. If Jupiter returns a quote without a `transaction`, surface `errorCode` and `errorMessage` directly.
7. Partially sign the base64 transaction locally.
8. Submit `POST /swap/v2/execute` with `signedTransaction` and `requestId`.
9. Return normalized telemetry and register the signature for async confirmation tracking when possible.

## Trigger V1 Flow

1. Resolve managed wallet.
2. Resolve trigger price.
3. Convert UI amount and trigger price into `makingAmount` and `takingAmount`.
4. Call `POST /trigger/v1/createOrder`.
5. Sign the returned transaction locally.
6. Call `POST /trigger/v1/execute`.
7. Return the order id plus `getTriggerOrders` tracking information.

## Signing Rules

- Transactions are signed locally with the managed wallet keypair.
- Use Solana kit transaction decoding and partial signing.
- Partial signing matters for Jupiter-managed swap flows because a returned transaction may already contain or later require additional signatures from the routing side.
- Do not rewrite the returned transaction before signing unless the product explicitly requires a custom transaction-building flow.

## Error Handling Rules

- If Jupiter returns `transaction: null` or an empty transaction with `errorCode` and `errorMessage`, surface the Jupiter message to the user or caller.
- Do not collapse quote simulation failures into generic parser errors.
- Treat missing `requestId` as a hard adapter error.
- Treat execution timeouts as pending rather than automatically failed if a signature already exists.

## Trading Routine Tightening

Use these rules to keep the model tighter and reduce ambiguous trade execution:

- Require explicit user intent before any write action.
- Prefer one stable mutation surface per user intent: `managedSwap`, `managedTriggerOrder`, `managedTriggerCancelOrders`, `scheduleManagedSwap`, `submitTradingRoutine`.
- Avoid routing users into legacy Ultra-only surfaces unless they explicitly request them.
- For swaps, omit provider unless the user explicitly asks for a provider-specific path.
- For trigger orders, do not infer `percentFromBuyPrice` unless the wording clearly references entry-relative behavior.
- For cancellations, resolve exact order ids first with `getTriggerOrders`.
- For managed wallet actions, prefer unique wallet name strings when the active runtime already has an unambiguous match.

## Recommended Prompt/Capability Direction

If you want the runtime even tighter, keep these product statements consistent:

- Main managed swap path = `Jupiter Swap API V2`.
- Trigger path = `Jupiter Trigger V1`.
- Legacy Ultra names remain for compatibility, not because they are the preferred new integration target.
- `managedSwap` is the normal user-facing swap mutation surface.
- `scheduleManagedSwap` is the normal time-based automation surface.
- `submitTradingRoutine` is the richer fallback only when needed.

## Knowledge Checklist

When touching Jupiter integrations in this repo, make sure these docs remain accurate:

- `apps/trenchclaw/src/ai/brain/knowledge/deep-knowledge/jupiter-ai-docs.md`
- `apps/trenchclaw/src/ai/brain/knowledge/deep-knowledge/trenchclaw-jupiter-integration.md`
- `apps/trenchclaw/src/ai/gateway/operator-prompt.ts`
- `apps/trenchclaw/src/runtime/capabilities/action-definitions.ts`

## Future Cleanup Ideas

- Rename legacy `ultra*` action labels to neutral Swap V2 names once compatibility is no longer needed.
- Add a dedicated Jupiter skill pack if model prompting around swaps, triggers, and routines keeps growing.
- Add one end-to-end smoke test that covers `managedSwap` plus one Trigger V1 order creation path with mock adapters.
