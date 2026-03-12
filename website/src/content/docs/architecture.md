---
title: Architecture
description: The real TrenchClaw architecture: repo layout, boot flow, settings layering, runtime execution, chat tooling, and state boundaries.
order: 2
---

# TrenchClaw Architecture

This page describes the architecture that is actually in the repository today.

The short version:

- TrenchClaw is a Bun monorepo.
- The core runtime lives in `apps/trenchclaw`.
- A runner boots the packaged app and local services from `apps/runner`.
- The public marketing/docs site lives in `website`.
- The local desktop-style GUI is a separate frontend workspace in `apps/frontends/gui`.
- Runtime behavior is assembled from settings, capability metadata, Solana actions, storage, and an optional LLM client.

## Monorepo Layout

Main workspaces:

- `apps/trenchclaw`: the core runtime, AI integration, Solana actions, storage, and HTTP API.
- `apps/runner`: launch/bootstrap layer used for local dev and packaged app startup.
- `apps/frontends/gui`: the local GUI frontend workspace.
- `apps/types`: shared type package.
- `website`: the public docs and marketing site.

Think of the repo as two different surfaces sharing one core:

1. the local runtime application
2. the public website

The website documents TrenchClaw. The local runtime actually holds wallets, queues jobs, runs actions, and talks to models.

## System Overview

```text
user
  -> runner / launcher
    -> local runtime server
      -> settings loader
      -> capability registry
      -> dispatcher + scheduler + policy engine
      -> storage + logs + memory
      -> Solana adapters and actions
      -> optional LLM client and chat service
    -> local GUI

public docs site
  -> separate SvelteKit app in website/
```

## Core Runtime Layers

Within `apps/trenchclaw/src`, the architecture is split by responsibility.

### 1. Brain and prompt assets

`src/ai/` now splits authored AI config from runtime state:

- `config/`: authored system prompt, mode prompts, payload manifest, filesystem manifest, and JSON safety profiles.
- `brain/knowledge/`: internal docs and skill/reference material.
- `.runtime-state/user/`: personal app settings such as `ai.json`, `settings.json`, and `vault.json`.
- `.runtime-state/instances/`: per-instance settings, wallets, and local instance state.
- `.runtime-state/generated/`: generated workspace context and knowledge inventory.

These files are inputs to runtime configuration and model prompting. They are not the execution engine.

### 2. AI model-facing code

`src/ai/` contains model-facing code:

- `llm/`: prompt loading, vault resolution, provider config, and model client wiring.
- `core/`: deterministic runtime primitives such as dispatcher, scheduler, policy engine, event bus, and state store implementations.
- `runtime/types/`: shared contracts for actions, context, events, state, and scheduler behavior.

Important boundary:

- `src/ai` is where model prompts and model I/O live.
- live runtime capability metadata does not live here anymore

### 3. Runtime assembly and API surface

`src/runtime/` is the composition root for the live app:

- `bootstrap.ts`: builds the runtime.
- `load/`: turns layered settings into validated `RuntimeSettings`.
- `capabilities/`: authoritative metadata for actions, workspace tools, and chat exposure.
- `chat.ts`: binds model streaming to runtime actions and workspace tools.
- `gui-transport/`: HTTP handlers for GUI and chat endpoints.
- `storage/`: SQLite-backed runtime state, session logs, summaries, and system logs.
- `security/`: path and write-scope constraints.

If you want to know what the runtime can actually do right now, `src/runtime/capabilities/` is the source of truth.

### 4. Solana domain implementation

`src/solana/` contains blockchain-specific behavior:

- `actions/`: the callable runtime actions.
- `lib/adapters/`: Jupiter, trigger, token account, signer, and RPC integration code.
- `lib/wallet/`: wallet storage, signing, policy, encryption, and wallet management.
- `routines/`: routine planners and loaders.
- `triggers/`: trigger modules that exist in code even if not all are public runtime features.

The pattern is:

- runtime decides whether something is exposed and allowed
- Solana action code performs the actual domain operation

## Boot Flow

The runtime starts from `src/runtime/start-runtime-server.ts`.

High-level boot sequence:

1. resolve the runtime profile, defaulting to `dangerous`
2. bootstrap the runtime in `src/runtime/bootstrap.ts`
3. load and normalize runtime settings
4. build the action registry from capability definitions
5. create adapters for RPC, Jupiter Ultra, Jupiter Trigger, token accounts, and signer access
6. create policy engine, dispatcher, scheduler, state stores, and logging
7. optionally create and instrument the LLM client
8. create the runtime chat service
9. expose the HTTP API with Bun

The runtime server is local-first and defaults to loopback:

- host: `127.0.0.1`
- port: `4020`

If the default port is in use and strict-port mode is not enabled, the runtime can bind another local port.

## Settings Architecture

Settings are layered rather than coming from one file.

### Base safety profile

The first layer is the selected safety profile JSON:

- `src/ai/config/safety-modes/safe.json`
- `src/ai/config/safety-modes/dangerous.json`
- `src/ai/config/safety-modes/veryDangerous.json`

This defines the starting policy posture.

### Compatibility settings

The next layer is the personal runtime settings file:

- `.runtime-state/user/settings.json`

This is where RPC preferences and vault references are loaded for the current user.

### Per-instance trading settings

The active instance can also contribute runtime trading preferences through:

- `.runtime-state/instances/<instanceId>/settings/trading.json`

That file is the canonical per-instance trading override path used by the runtime loader.

### Agent overrides

An additional agent settings file can be merged in, but it is sanitized by authority rules in `src/runtime/load/authority.ts`.

### Final runtime settings

`src/runtime/load/loader.ts` normalizes all of that into one validated `RuntimeSettings` object.

Key result:

- safety modes set the default envelope
- user and instance settings fill in operational choices
- authority enforcement prevents protected settings from being silently overridden

## Capability Model

TrenchClaw does not expose every file in `src/solana/actions/` directly just because it exists in the tree.

The public runtime surface is defined in two steps:

1. action implementations exist in `src/solana/actions/`
2. capability definitions in `src/runtime/capabilities/action-definitions.ts` decide description, purpose, example input, and whether each action is included and enabled

Workspace tools are handled the same way in `src/runtime/capabilities/workspace-tool-definitions.ts`.

This matters because the runtime distinguishes between:

- code that exists
- code that is cataloged
- code that is enabled under current settings
- code that is exposed to chat

That separation is one of the most important architectural choices in the repo.

## Action Execution Path

When a runtime action runs, the path is:

1. a request names an action
2. the runtime checks whether that action exists in the supported catalog
3. `runtime-settings-guard` verifies it is enabled and, when needed, confirmed by the user
4. the dispatcher builds an action context with state stores, event bus, RPC URL, adapters, and job controls
5. the action executes
6. the runtime records outcomes, receipts, and logs

This is what keeps execution deterministic and auditable.

The action registry is not just a convenience list. It is the live contract between:

- settings
- chat/tool exposure
- policy checks
- actual execution

## Chat and LLM Flow

Chat is built in `src/runtime/chat.ts`.

The chat service combines:

- the current system prompt assembled by `src/ai/llm/prompt-loader.ts`
- wallet/runtime prompt context
- live action tools generated from the action registry
- optional workspace tools when filesystem access is allowed
- model streaming through the AI SDK

Tool exposure is dynamic:

- action tools come from the runtime capability snapshot
- workspace tools are only added when runtime settings allow them

So the model does not get a permanently fixed tool list. It gets a tool surface derived from the current runtime profile and settings.

## HTTP and GUI Transport

The runtime serves two broad endpoint families through `src/runtime/gui-transport/router.ts`.

### Versioned runtime endpoints

- `/v1/health`
- `/v1/runtime`
- `/v1/chat/stream`
- `/v1/chat/turn`

These are the cleaner runtime-style API endpoints.

### GUI-oriented endpoints

- `/api/gui/bootstrap`
- `/api/gui/events`
- `/api/gui/queue`
- `/api/gui/schedule`
- `/api/gui/activity`
- `/api/gui/conversations`
- wallet, instance, vault, and test routes under `/api/gui/*`

These support the local GUI and operational panels.

This means the runtime is both:

- an execution engine
- the backend for the local GUI

## Persistence and State

Runtime state is persisted under the runtime state root, which defaults to `~/.trenchclaw` unless `TRENCHCLAW_RUNTIME_STATE_ROOT` overrides it.

Important runtime path zones:

- `db/`: SQLite databases, sessions, memory files, queue state, and log artifacts
- `user/`: vault files and user workspace content
- `instances/`: instance profiles, active instance state, and per-instance files
- `generated/`: generated manifests and derived runtime files
- `protected/keypairs/`: managed wallets and key material

In practical terms, TrenchClaw stores:

- jobs
- receipts
- session logs
- summaries
- conversation messages
- memory artifacts
- instance metadata
- wallet files
- vault secrets

The storage layer is intentionally local and file-backed. This is not a hosted multi-tenant cloud architecture.

In release installs, that writable state is intentionally separate from the immutable install tree under `~/.local/share/trenchclaw/<version>/`.

## Instance Boundaries

Instances are a major architectural boundary.

An active instance determines:

- which instance profile is loaded
- which per-instance trading settings apply
- which wallet area is in scope
- which conversations and memory are associated with the operator context

That means TrenchClaw is not just one global runtime state. It is a runtime plus an active-instance lens over protected local state.

## Public Website vs Local GUI

There are two frontend concerns in the monorepo and they should not be confused.

### `website/`

This is the public SvelteKit site:

- marketing pages
- docs pages
- installation instructions

It is not the runtime control plane.

### `apps/frontends/gui`

This is the local GUI frontend workspace for interacting with the runtime:

- instance selection
- chat
- vault/secrets
- wallet browsing
- queue and activity views

Architecturally, the website explains the product, while the local GUI operates the product.

## What Makes This Architecture Distinct

The most important architectural traits are:

- local-first execution instead of hosted custody
- explicit safety profiles instead of one flat permission model
- capability metadata as a first-class layer between code and exposure
- chat tools derived from runtime state rather than hard-coded globally
- instance-scoped protected state for wallets, memory, and settings
- deterministic action execution behind a model-facing interface

This is not “an AI bot that directly does whatever code exists.” It is a constrained runtime that decides what the model may see and call in the current session.

## Current Architectural Limits

A few important edges still exist:

- switching instances does not fully rebuild the runtime policy surface unless the runtime is rebooted
- not every trigger or strategy module in the repo is a public supported feature
- many advanced workflows still depend on chat rather than dedicated GUI flows
- the runtime remains local and should not be exposed off-loopback without your own security controls

## File Map For Architects

If you want to inspect the architecture from the code directly, start here:

- `apps/trenchclaw/src/runtime/start-runtime-server.ts`
- `apps/trenchclaw/src/runtime/bootstrap.ts`
- `apps/trenchclaw/src/runtime/load/loader.ts`
- `apps/trenchclaw/src/runtime/capabilities/action-definitions.ts`
- `apps/trenchclaw/src/runtime/capabilities/selectors.ts`
- `apps/trenchclaw/src/runtime/chat.ts`
- `apps/trenchclaw/src/runtime/gui-transport/router.ts`
- `apps/trenchclaw/src/runtime/storage/`
- `apps/trenchclaw/src/ai/llm/`
- `apps/trenchclaw/src/solana/actions/`

If you read those in that order, you will get the real architecture, not the marketing version.
