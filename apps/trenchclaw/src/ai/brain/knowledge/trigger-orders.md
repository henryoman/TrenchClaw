# Trigger Orders Playbook

Use this file when the user asks for limit orders, trigger orders, stop losses,
take profits, or cancellation of existing trigger orders.

## Place A Trigger Or Limit Order

- default tool: `managedTriggerOrder`
- use for requests like:
  - "sell if price hits X"
  - "buy when token drops to Y"
  - "set a stop loss"
  - "set a take profit"

## Pick The Trigger Shape

- use exact target-price style when the user gives a literal price target
- use percent-from-buy-price style only when the user clearly references entry
  price, stop loss percentage, or take profit percentage

## Read Existing Orders

- default tool: `getTriggerOrders`
- use before cancellation or when the user asks for current active orders

## Cancel Orders

- read exact order ids first with `getTriggerOrders`
- then cancel with `managedTriggerCancelOrders`
- prefer exact ids over broad guesses

## Routing Rules

- do not place an order unless the user clearly asked for it
- resolve wallet and token identity first if they are ambiguous
- after success, tell the user the order can be tracked with `getTriggerOrders`

## If You Need More Detail

- open `swap` for the broader swap-and-orders routing guide
- open `trenchclaw-jupiter-integration` for app-specific Jupiter behavior
