---
title: Runtime and Frontends
description: Understand how the runner, runtime, and frontend apps connect in this monorepo.
order: 5
---

TrenchClaw runs as a split architecture: runtime core plus GUI served by a runner.

## Core Packages

- `apps/trenchclaw`: core runtime
- `apps/frontends/gui`: web UI
- `apps/runner`: process launcher and static server for GUI assets

## Runtime Flow

```mermaid
flowchart LR
  A["apps/frontends/gui (build)"] --> B["apps/frontends/gui/dist"]
  C["apps/trenchclaw (runtime)"] --> D["runtime API"]
  B --> E["apps/runner"]
  D --> E
  E --> F["Local app session"]
```

The runner serves GUI assets and bridges UI requests to the runtime API.

## Build Outputs

- Runner build: `apps/runner/dist`
- GUI build: `apps/frontends/gui/dist`
- App bundle output: `dist/app`

## Local Commands

```bash
bun run app:build
bun run start
```

For GUI-only iteration:

```bash
bun run gui:dev
```

## Important Path Note

`apps/frontends/runner` is legacy and not a valid source package path.
