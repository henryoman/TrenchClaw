---
title: Runtime and Frontends
description: Understand the local runtime, the GUI, and what each surface actually does today.
order: 7
---

## Local Model

TrenchClaw runs as:

- a local runtime API
- a local GUI
- a local proxy from the GUI to the runtime

Default ports:

- runtime API: `127.0.0.1:4020`
- GUI: `127.0.0.1:4173`

## Runtime

- actions and policy checks
- queued routines
- local state
- conversations, activity, receipts, and memory

## GUI

- instance selection and sign-in
- chat
- secrets and vault editing
- wallet tree browsing
- wallet JSON backup download
- queue, schedule, and activity visibility
- conversation history browsing

## Current Limits

- no dedicated GUI wallet creation flow
- no dedicated GUI wallet rename flow
- no full runtime settings editor
- many execution flows are still chat-driven

## Browser Launch

After startup, the runner prompts whether to open the GUI automatically.

- `Enter` launches the browser
- `skip` leaves the runtime running without opening the browser
- `quit` exits the app

## Main Endpoints

Current endpoints include:

- `/health`
- `/`
- `/api/gui/*`
- `/v1/health`
- `/v1/runtime`
- `/v1/chat/stream`
- `/v1/chat/turn`

## Instance Scope

The active instance affects:

- wallet roots
- conversations
- memory and profile facts
- user-facing state in the protected instance directory

## Typical Flow

1. Launch `trenchclaw`.
2. Choose or create an instance.
3. Configure secrets and RPC settings.
4. Test AI connectivity if you want chat-driven workflows.
5. Use chat and the runtime surfaces for actions, routines, and inspection.
6. Use queue, schedule, and activity views to inspect what the runtime is doing.
