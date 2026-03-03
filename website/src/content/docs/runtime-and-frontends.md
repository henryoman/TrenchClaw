---
title: Runtime and Frontends
description: Understand how the runner, runtime, and frontend apps connect in this monorepo.
order: 5
---

TrenchClaw is split into a runtime and frontend surfaces:

- `apps/runner` is the runtime launcher and static server for GUI assets.
- `apps/trenchclaw` is the core runtime.
- `apps/frontends/gui` is the web UI bundle served by the runner.

The runner build output is expected in:

- `apps/runner/dist`

GUI build output is expected in:

- `apps/frontends/gui/dist`

App bundle output is expected in:

- `dist/app`

Legacy path note: `apps/frontends/runner` is not a valid source package and should not be used.
