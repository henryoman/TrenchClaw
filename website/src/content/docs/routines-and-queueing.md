---
title: Routines and Queueing
description: Understand the currently shipped automation surface, including the real built-in routines, queued execution model, and workspace routine delegation.
order: 8
---

TrenchClaw does have a real routine and queueing system, but the public docs need to describe the current scope accurately.

## What Is Actually Shipped

The built-in routine planners currently loaded by the runtime are:

- `actionSequence`
- `createWallets`

Those are the stable routine names to document as first-class shipped behavior.

## What `actionSequence` Does

`actionSequence` lets the runtime execute an ordered list of action steps.

Current step features include:

- explicit `actionName`
- arbitrary `input`
- optional step `key`
- optional `dependsOn`
- optional `idempotencyKey`
- optional retry policy

This is the generic queueable routine surface for multi-step runtime work.

## What `createWallets` Does

The `createWallets` routine wraps the managed wallet creation flow.

Depending on config, it can:

- run a single create-wallet batch
- create multiple wallet groups
- append rename steps after creation

## Queueing Model

The runtime can enqueue jobs for:

- immediate execution
- future execution at a Unix-millisecond timestamp

The queue is persisted, and the runtime can recover interrupted running jobs on restart.

## Job Management

Current job-control surfaces support:

- enqueue
- pause
- resume
- cancel

The queue, schedule, and activity panels are good public docs targets because they reflect real runtime behavior, even if some controls are still more runtime-oriented than GUI-native.

## Workspace Routine Files

The runtime also supports workspace routine delegation through `.routine.json` files.

Current behavior is important:

- workspace routines delegate to the built-in routine planners
- the loader meaningfully uses `routineName`, `config`, and `steps`
- example files in the repo may include richer-looking fields than the loader actually consumes as first-class logic

So public docs should present workspace routines as a thin delegation layer, not as a fully separate strategy DSL.

## What Not To Overclaim

Do not document these as fully shipped operator features right now:

- trigger-driven automation from timer, price, or on-chain triggers
- a large library of live strategy routines such as DCA, sniper, swing, or percentage execution

The repo contains naming and placeholders around those areas, but the current runtime planner surface is much narrower.

## Good Public Framing

Accurate framing:

- TrenchClaw currently ships durable queued execution for `actionSequence` and `createWallets`, plus workspace-file delegation into those routines.

Inaccurate framing:

- claiming a full strategy automation engine with live triggers and many production-ready strategy planners

## Operational Tips

- keep early routines simple and explicit
- use idempotency keys and dependencies deliberately
- inspect queue and activity state after submitting scheduled work
