# TrenchClaw Architecture

TrenchClaw is a local runtime first and a GUI second. The GUI is a client for the runtime, not the source of truth.

This page is for power users who want to understand where state lives, what the `.runtime` folder means, and which guard rails shape execution.

## The Three Main Layers

### `apps/trenchclaw`

This is the core runtime.

It owns:

- settings loading and settings authority
- runtime boot and service startup
- action registration and execution
- model tool exposure
- storage, logs, caches, and instance state

### `apps/frontends/gui`

This is the local web GUI.

It reads and updates runtime state through runtime transport APIs. It does not own the canonical state on disk.

### `apps/runner`

This is the packaged launcher.

In bundled installs it starts the runtime and serves the GUI together.

## How Boot Works

The runtime boots in `apps/trenchclaw/src/runtime/bootstrap.ts`.

The high-level sequence is:

1. resolve the app root and runtime state roots
2. resolve the active instance
3. load and merge settings for that instance
4. initialize storage and instance layout
5. build the runtime tool snapshot
6. register action surfaces and policies
7. start chat, scheduler, GUI transport, and supporting services

The important part is that TrenchClaw does not boot into a generic shared workspace. It boots into one active instance with instance-scoped state.

## `.runtime` vs `.runtime-state`

This is the distinction most power users need to understand.

### `.runtime`

`.runtime` is the repo-tracked runtime contract and template area.

Think of it as the intended layout and protected structure that the app ships with. It is not the mutable source of truth for live operator state.

In practice, if you are debugging real runtime behavior, do not assume `.runtime` is where the current instance is actively changing.

### `.runtime-state`

`.runtime-state` is the mutable state root.

That is where TrenchClaw writes per-instance runtime data such as:

- the active instance pointer
- instance profile metadata
- secrets and vault data
- AI, compatibility, trading, and wakeup settings
- SQLite state
- logs, caches, and memory artifacts
- managed wallet files and indexes
- the instance workspace

In workspace development, the default mutable root is the external hidden dev runtime at `~/.trenchclaw-dev-runtime`. In packaged or overridden environments it can move to another absolute path through environment configuration such as `TRENCHCLAW_RUNTIME_STATE_ROOT`.

## What Lives Inside One Instance

Each instance lives under `.runtime-state/instances/<id>/`.

The important paths are:

- `instance.json`
  - instance identity and profile metadata
- `settings/ai.json`
  - AI provider and model selection
- `settings/settings.json`
  - compatibility and runtime settings
- `settings/trading.json`
  - trading configuration for that instance
- `settings/wakeup.json`
  - wakeup behavior and related GUI/runtime controls
- `secrets/vault.json`
  - secret material and private credentials
- `data/runtime.db`
  - main SQLite runtime store
- `cache/queue.sqlite`
  - queue and related runtime cache data
- `cache/memory/`
  - memory artifacts and long-term memory files
- `logs/live/`
  - rolling live logs
- `logs/sessions/`
  - per-session logs and summaries
- `logs/summaries/`
  - summary streams
- `logs/system/`
  - runtime/system event logs
- `keypairs/`
  - managed wallets and wallet sidecars
- `workspace/`
  - instance-scoped operator workspace
- `shell-home/`, `tmp/`, `tool-bin/`
  - isolated runtime shell support directories

Instances use ids like `01`, `02`, `03`, and the display name comes from `instance.json`.

## Why The Instance Model Matters

The instance boundary is one of the main TrenchClaw guard rails.

It means:

- one operator profile does not silently bleed into another
- settings, vaults, wallets, and logs stay grouped together
- the runtime can enforce instance-scoped storage and workspace rules
- the GUI can switch instances without becoming the storage authority

## Execution Guard Rails

TrenchClaw is not just a thin wrapper around an LLM plus a shell.

The important guard rails are:

- tool-gated execution
  - the model only sees tools that exist in the runtime tool snapshot and are enabled by current settings
- settings-aware action policy
  - unsupported or disabled actions are blocked before execution
- explicit confirmation for dangerous actions
  - some actions require a user confirmation token when dangerous-mode confirmations are enabled
- protected settings authority
  - user-protected settings paths win over agent overlays for sensitive areas like trading, RPC, and dangerous wallet settings
- write-scope boundaries
  - runtime writes are constrained to allowed runtime roots instead of arbitrary filesystem paths
- instance-scoped workspace tools
  - workspace reads and writes are tied to the active instance rather than the whole repo or machine

This is a major difference between TrenchClaw and simpler OpenClaw-style wrappers that mostly expose broad filesystem or shell access with thinner runtime boundaries.

## Model And Tool Exposure

The model does not get arbitrary repo power by default.

The main surfaces are:

- runtime actions that are registered and exposed through the tool snapshot
- workspace tools such as `workspaceBash`, `workspaceReadFile`, and `workspaceWriteFile` when enabled by policy

If a tool is not in the injected runtime tool catalog for the current run, it is not callable.

## Generated Runtime Support Files

TrenchClaw also writes prompt-support artifacts under the active instance at `.runtime-state/instances/<id>/cache/generated/`.

Those generated files support runtime context injection, but they are not the same thing as the per-instance mutable state root.

## Mental Model

If you want the shortest correct mental model, use this:

- `.runtime` is the shipped contract
- `.runtime-state` is the live mutable state
- `apps/trenchclaw` is the authority
- `apps/frontends/gui` is the client
- the active instance is the boundary that scopes state, tools, and operator workflows
