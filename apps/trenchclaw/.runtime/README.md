# Runtime Contract

This directory is the repo-tracked runtime contract and seed template.

Contract map:

- `README.md` defines the runtime roots, layout, and repo boundaries.
- `instances/<id>/WAKEUP.md` defines runtime boot, restart, crash-recovery, and resume semantics for that instance.

Root model:

- `.runtime/` is tracked repo content. It is not live mutable runtime state.
- `.runtime/instances/01/` is the tracked seed instance template used by developer-runtime initialization.
- `.runtime-state/instances/<id>/` is the live mutable runtime state when using the repo-local runtime root.
- An external runtime root such as `~/.trenchclaw-dev-runtime` uses the same `instances/<id>/...` layout, just outside the repo.
- Generated prompt-support artifacts are instance-scoped under `instances/<id>/cache/generated/`.
- Long-form research notes belong under `instances/<id>/workspace/notes/`.
- Raw downloaded market-data artifacts belong under `instances/<id>/workspace/output/`.

Current shipping behavior:

- Local dev bootstrap reads tracked seed/template content from `.runtime/`.
- Runtime boot reads and writes mutable instance state under `.runtime-state/instances/<id>/...` or the external root selected by `TRENCHCLAW_RUNTIME_STATE_ROOT`, including generated snapshots under `cache/generated/`.
- Runtime workspace downloads and operator-created artifacts should stay under the instance `workspace/` tree, not under `cache/generated/`.
- Packaged releases currently do not ship `.runtime/` as the live runtime root. Mutable runtime state is created on first run under `~/.trenchclaw` by default or under `TRENCHCLAW_RUNTIME_STATE_ROOT`.

Rules:

- `.runtime/` is documentation and contract only.
- Runtime code must never write into `.runtime/`.
- Mutable runtime state lives under `.runtime-state/instances/<id>/`.
- Generated prompt-support artifacts live under `.runtime-state/instances/<id>/cache/generated/`.
- Raw JSON/API download artifacts belong under `.runtime-state/instances/<id>/workspace/output/`.
- Long-form research writeups belong under `.runtime-state/instances/<id>/workspace/notes/`.
- GeckoTerminal OHLC downloads belong under `.runtime-state/instances/<id>/workspace/output/research/market-data/geckoterminal/ohlcv/`.
- The only cross-instance mutable file is `.runtime-state/instances/active-instance.json`.
- Append-only logs use `.jsonl`.
- Session summary snapshots use `.json`.

Developer workflow notes:

- `bun run dev` defaults to a persistent external runtime root at `~/.trenchclaw-dev-runtime`.
- Generated prompt-support artifacts default to the active instance's `cache/generated/` directory inside that runtime root.
- That external runtime root is for local development and tester state, not for committed repo data.
- Personal vaults, keypairs, databases, logs, caches, and generated artifacts must stay outside the repo.
- Tests should use temporary runtime roots, not the persistent developer runtime.
- Agents and contributors should treat `.runtime/` as the source-of-truth contract and the external runtime root as mutable local state.

Tracked instance layout:

```text
.runtime/
  instances/
    active-instance.json
    01/
      WAKEUP.md
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
        generated/
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

Important distinction:

- `.runtime/instances/01/` is a tracked seed instance, not an active runtime instance.
- The active runtime instance lives under `.runtime-state/instances/<id>/` or the configured external runtime root.
- Example research path: `instances/<id>/workspace/output/research/market-data/geckoterminal/ohlcv/`.

## GeckoTerminal OHLC Command

Working CLI form:

```bash
TRENCHCLAW_RUNTIME_STATE_ROOT="/Volumes/T9/cursor/TrenchClaw/apps/trenchclaw/.runtime-state" \
TRENCHCLAW_ACTIVE_INSTANCE_ID="01" \
bun run "src/solana/actions/execute.ts" downloadGeckoTerminalOhlcv \
  --input-json '{"poolAddress":"Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE","timeframe":"minute","aggregate":5,"limit":5}'
```

Allowed timeframe values:

- `minute`
- `hour`
- `day`

Allowed aggregate values by timeframe:

- `minute`: `1`, `5`, `15`
- `hour`: `1`, `4`, `12`
- `day`: `1`

Action defaults and limits:

- `limit` defaults to `100`
- `limit` max is `1000`
- `includeEmptyIntervals` defaults to `false`
- `beforeTimestamp` is Unix seconds

Saved artifact filename pattern:

- `{poolAddressSanitized}-{timeframe}-agg-{aggregate-or-default}-{downloadedAtIso}.json`

Saved JSON contains:

- normalized request metadata
- exact request URL
- full GeckoTerminal response payload
