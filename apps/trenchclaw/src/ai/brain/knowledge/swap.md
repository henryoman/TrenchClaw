# Swap Playbook

Use this file when the user asks to swap, quote, schedule a swap, or place a
trigger order and you want the shortest repo-authored guide.

## Normal Swap

- default tool: `managedSwap`
- use when the user says things like:
  - "swap 0.2 SOL to JUP"
  - "buy BONK with 1 SOL"
- do not force a provider unless the user explicitly asks for one

## Quote-Oriented Or Provider-Specific Flow

- use provider-specific quote tools only when the user asks for quote detail or
  wants a specific provider path
- otherwise stay on `managedSwap`

## Trigger Or Limit Orders

- default tool: `managedTriggerOrder`
- use when the user asks for:
  - limit buy
  - limit sell
  - stop loss
  - take profit
- after success, tell the user they can track the order with
  `getTriggerOrders`

## Cancel Trigger Orders

- read orders first with `getTriggerOrders`
- then cancel with `managedTriggerCancelOrders`
- prefer exact order ids before cancellation

## Scheduled Swap

- default tool: `scheduleManagedSwap`
- use for delayed execution, recurring buys, and simple DCA plans

## Safety And Routing Rules

- do not mutate unless the user clearly asked for the action
- if token identity is ambiguous, resolve it first with read tools
- if wallet selection is ambiguous, resolve the wallet first
- prefer one stable mutation surface per request instead of mixing tools

## If You Need More Detail

- open `trenchclaw-jupiter-integration` for app-specific Jupiter wiring
- open `jupiter-ai-docs` for deeper provider reference
