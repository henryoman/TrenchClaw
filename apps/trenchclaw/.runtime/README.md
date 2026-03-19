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
