# Jupiter Tool Usage In TrenchClaw

Last verified: 2026-03-23

This document explains how to use each Jupiter-related trading tool exposed by
TrenchClaw, what inputs the model should pass, and when each tool should be
preferred.

## Core Rule

- For normal swap requests, prefer `managedSwap`.
- `managedSwap` should honor the user's configured preferred swap provider.
- If no user preference override exists, the default remains `ultra`.
- Trigger orders stay on `Trigger V1` in this app.

## Swap Tools

### `managedSwap`

Use this for normal managed-wallet swaps.

Pass:

- `wallet` or `walletGroup` + `walletName`
- `inputCoin`
- `outputCoin`
- `amount`
- optional `amountUnit`
- optional `provider`

Behavior:

- `provider: "configured"` means use the user's preferred swap provider.
- If omitted or set to `configured`, this is the best default surface.
- Use `provider: "ultra"` only when the user explicitly wants that path.
- Use `provider: "standard"` only when the user explicitly wants the Swap API V2 path or a non-Ultra path.

Example:

```json
{
  "walletGroup": "core-wallets",
  "walletName": "wallet_000",
  "inputCoin": "SOL",
  "outputCoin": "USDC",
  "amount": "0.1",
  "amountUnit": "ui"
}
```

### `managedUltraSwap`

Use this only for the legacy Ultra-specific managed swap surface.

Pass the same shape as `managedSwap`, but use it only when the user explicitly
asks for Ultra or you are testing the legacy path.

### `ultraSwap`

This is the lower-level quote-and-execute Ultra flow. Prefer `managedSwap` for
real user requests unless you are working on adapter-level or compatibility
testing.

### `ultraQuoteSwap`

Use this when you only need a managed Jupiter quote and do not want to execute
the swap yet.

### `ultraExecuteSwap`

Use this only if a prepared transaction already exists and you need to finish
execution with a known `requestId` and signed transaction.

## Trigger Tools

### `managedTriggerOrder`

Use this when the user explicitly asks to place a trigger or limit order from a
managed wallet.

Pass:

- `wallet` or `walletGroup` + `walletName`
- `inputCoin`
- `outputCoin`
- `amount`
- `direction`
- `trigger`

Rules:

- Prefer `trigger.kind = "exactPrice"` for direct target prices.
- Use `percentFromBuyPrice` only for entry-relative requests like stop loss or
  take profit by percent.

Example:

```json
{
  "walletGroup": "core-wallets",
  "walletName": "wallet_001",
  "inputCoin": "JUP",
  "outputCoin": "SOL",
  "amount": "100",
  "direction": "sellAbove",
  "trigger": {
    "kind": "exactPrice",
    "price": "0.005"
  }
}
```

### `getTriggerOrders`

Use this to list active or historical trigger orders, to find order ids before
canceling, or to confirm that a submitted order exists.

Pass:

- `user` or managed wallet selector
- `orderStatus`: `active` or `history`

### `managedTriggerCancelOrders`

Use this to cancel one or more Trigger V1 orders for a managed wallet.

Pass:

- `wallet` or `walletGroup` + `walletName`
- `orders`: array of exact order ids

Best practice:

- Resolve order ids first with `getTriggerOrders`.

## Scheduling And Routine Tools

### `scheduleManagedSwap`

Use this for delayed swaps and simple DCA plans while honoring the configured
provider by default.

### `scheduleManagedUltraSwap`

Use this only for the legacy Ultra-only scheduling surface.

### `submitTradingRoutine`

Use this only when the user needs a richer multi-step JSON trading routine that
does not fit the simpler scheduling surface.

## Tool Selection Checklist

- Immediate swap: `managedSwap`
- Explicit legacy Ultra swap: `managedUltraSwap`
- Quote only: `ultraQuoteSwap`
- Prepared swap execution: `ultraExecuteSwap`
- Place trigger order: `managedTriggerOrder`
- Read trigger orders: `getTriggerOrders`
- Cancel trigger orders: `managedTriggerCancelOrders`
- Schedule a simple future swap or DCA: `scheduleManagedSwap`
- Complex multi-step automation: `submitTradingRoutine`

## Model Guidance

- Keep tool calls flat and minimal.
- Do not force provider fields unless the user explicitly requests them.
- Default to `managedSwap` for swap requests and let configured preference do the work.
- For trigger orders, do not invent price-relative semantics unless the user clearly asks for them.

## Rename Rule

- When the user renames a managed wallet, use `renameWallets` and expect the rename to be canonical.
- Canonical means the new name must be reflected in the wallet library entry, the keypair filename, and the protected `.label.json` sidecar.
- A rename is not complete if only the UI label changes.
