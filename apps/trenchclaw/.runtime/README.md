# Runtime Contract

This directory is the repo-tracked template for runtime state.

Rules:

- `.runtime/` is documentation and contract only.
- Runtime code must never write into `.runtime/`.
- Mutable runtime state lives under `.runtime-state/instances/<id>/`.
- Generated prompt-support artifacts live under `.trenchclaw-generated/`.
- The only cross-instance mutable file is `.runtime-state/instances/active-instance.json`.
- Append-only logs use `.jsonl`.
- Session summary snapshots use `.json`.

Developer workflow notes:

- `bun run dev` defaults to a persistent external runtime root at `~/trenchclaw-dev-runtime`.
- `bun run dev` defaults to a persistent external generated root at `~/trenchclaw-dev-generated`.
- Those external roots are for local development and tester state, not for committed repo data.
- Personal vaults, keypairs, databases, logs, caches, and generated artifacts must stay outside the repo.
- Tests should use temporary runtime roots, not the persistent developer runtime.
- Agents and contributors should treat `.runtime/` as the source-of-truth contract and the external runtime root as mutable local state.

Tracked instance layout:

```text
.runtime/
  instances/
    active-instance.json
    01/
      instance.json
      settings/
        ai.json
        settings.json
        trading.json
      secrets/
        vault.json
      data/
      logs/
        live/
        sessions/
        summaries/
        system/
      cache/
        memory/
      keypairs/
      workspace/
        strategies/
        configs/
        typescript/
        notes/
        scratch/
        output/
        routines/
      shell-home/
      tmp/
      tool-bin/
```
