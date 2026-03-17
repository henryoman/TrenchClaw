---
title: Routines and Queueing
description: Use the routines and queue that are actually shipped today.
order: 8
---

## Built-In Routines

Current built-in routines:

- `actionSequence`
- `createWallets`
- queued `scheduleManagedUltraSwap` plans

## `actionSequence`

Supported step fields:

- explicit `actionName`
- arbitrary `input`
- optional step `key`
- optional `dependsOn`
- optional `idempotencyKey`
- optional retry policy

## `createWallets`

This routine wraps managed wallet creation and optional rename steps.

## Queue

- immediate execution
- future execution at a Unix-millisecond timestamp

The queue is persisted and can recover interrupted running jobs on restart.

Current beta queueing is explicit and narrow. It is useful for straightforward scheduled work, not a broad autonomous strategy engine.

## Job Management

- enqueue
- pause
- resume
- cancel

## Workspace Routines

`.routine.json` files can delegate into built-in routine planners.

- workspace routines delegate to the built-in routine planners
- the loader meaningfully uses `routineName`, `config`, and `steps`
- extra example fields in repo files should not be treated as a separate DSL

## Not Shipped As Public Runtime Features

- trigger-driven automation from timer, price, or on-chain triggers beyond direct Jupiter Trigger order actions
- a large library of live strategy routines such as DCA, sniper, swing, or percentage execution

## Tips

- keep early routines simple and explicit
- use idempotency keys and dependencies deliberately
- inspect queue and activity state after submitting scheduled work
