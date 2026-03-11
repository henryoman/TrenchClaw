---
title: Runtime and Frontends
description: Understand the current local networking model, what the GUI really does today, and which workflows are chat-driven versus dedicated GUI features.
order: 7
---

TrenchClaw currently runs as a local runtime plus a locally served GUI.

## Local Networking Model

In the packaged path, the runner:

- starts the runtime API on localhost near `127.0.0.1:4020`
- starts the GUI on localhost near `127.0.0.1:4173`
- proxies GUI `/api/*` requests back to the runtime

If the preferred ports are busy, the runner increments to the next available local ports.

## What The Runtime Owns

The runtime owns:

- action registration and policy checks
- queued routines and scheduler behavior
- local state and SQLite-backed persistence
- conversations, activity, receipts, and runtime memory
- wallet- and vault-adjacent operator surfaces

## What The GUI Owns

The current GUI is an operator surface on top of the runtime. Today it is strongest at:

- instance selection and sign-in
- chat
- secrets and vault editing
- wallet tree browsing
- wallet JSON backup download
- queue, schedule, and activity visibility
- conversation history browsing

## Important Current Limitation

The shipped GUI is not a full parity surface for every runtime capability.

Examples of what the website should not overclaim:

- there is no dedicated GUI wallet creation flow
- there is no dedicated GUI wallet rename flow
- there is no full runtime settings editor in the current GUI
- many execution workflows are still chat-driven or action-driven rather than button-driven

## Browser Launch Behavior

After startup, the runner prompts whether to open the GUI automatically.

- `Enter` launches the browser
- `skip` leaves the runtime running without opening the browser
- `quit` exits the app

## Runtime Health And API

Current runtime endpoints include:

- `/health`
- `/`
- `/api/gui/*`
- `/v1/health`
- `/v1/runtime`
- `/v1/chat/stream`
- `/v1/chat/turn`

The GUI and runtime are designed for local use. Keep the runtime loopback-only unless you intentionally add your own access controls in front of it.

## Instance Awareness

The GUI and runtime surfaces are organized around the active local instance.

That affects:

- wallet roots
- conversations
- memory and profile facts
- operator-facing state in the protected instance directory

## Typical Operator Flow

1. Launch `trenchclaw`.
2. Choose or create an instance.
3. Configure secrets and RPC settings.
4. Test AI connectivity if you want chat-driven workflows.
5. Use chat and the runtime surfaces for actions, routines, and inspection.
6. Use queue, schedule, and activity views to inspect what the runtime is doing.
