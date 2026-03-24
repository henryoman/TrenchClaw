# Runtime Contract

This directory is the repo-tracked runtime contract and seed instance.

Contract map:

- `README.md` defines the runtime roots, layout, and repo boundaries.

Root model:

- `.runtime/` is tracked repo content. It is not live mutable runtime state.
- `.runtime/instances/00/` is the tracked seed instance copied into new runtime instances.
- `.runtime-state/instances/<id>/` is the live mutable runtime state when using the repo-local runtime root.
- An external runtime root such as `~/.trenchclaw-dev-runtime` uses the same `instances/<id>/...` layout, just outside the repo.
- Long-form research notes belong under `instances/<id>/workspace/notes/`.
- Raw downloaded market-data artifacts belong under `instances/<id>/workspace/output/`.

Current shipping behavior:

- Local dev bootstrap copies tracked seed content from `.runtime/`.
- Runtime boot reads and writes mutable instance state under `.runtime-state/instances/<id>/...` or the external root selected by `TRENCHCLAW_RUNTIME_STATE_ROOT`.
- User-controlled tab state should live in instance-local JSON files such as `settings/*.json`, `secrets/vault.json`, and `workspace/configs/*.json`.
- Packaged releases currently do not ship `.runtime/` as the live runtime root. Mutable runtime state is created on first run under `~/.trenchclaw` by default or under `TRENCHCLAW_RUNTIME_STATE_ROOT`.

Tracked seed contents:

- Commit the seed files that define the shared contract for new runtimes.
- The tracked seed instance is `instances/00/`.
- The tracked seed now stays intentionally minimal. Runtime-only folders are created lazily when features need them.
- Update shared defaults by editing the seed files in `.runtime/instances/00/`.
- Shared model prompts live under `src/ai/brain/config/prompts/`.
Rules:

- `.runtime/` is documentation and contract only.
- Runtime code must never write into `.runtime/`.
- Mutable runtime state lives under `.runtime-state/instances/<id>/`.
- Raw JSON/API download artifacts belong under `.runtime-state/instances/<id>/workspace/output/`.
- Long-form research writeups belong under `.runtime-state/instances/<id>/workspace/notes/`.
- GeckoTerminal OHLC downloads belong under `.runtime-state/instances/<id>/workspace/output/research/market-data/geckoterminal/ohlcv/`.
- The only cross-instance mutable file is `.runtime-state/instances/active-instance.json`.
- Append-only logs use `.jsonl`.
- Session summary snapshots use `.json`.

Developer workflow notes:

- `bun run dev` defaults to a persistent external runtime root at `~/.trenchclaw-dev-runtime`.
- That external runtime root is for local development and tester state, not for committed repo data.
- Do not point `TRENCHCLAW_RUNTIME_STATE_ROOT` at your repo root, home directory, or a broad shared folder. Use a dedicated app-specific directory only.
- Personal vaults, keypairs, databases, logs, caches, and user state must stay outside the repo.
- Tests should use temporary runtime roots, not the persistent developer runtime.
- Agents and contributors should treat `.runtime/` as the source-of-truth contract and the external runtime root as mutable local state.

Tracked instance layout:

```text
.runtime/
  instances/
    00/
      instance.json
      settings/
        ai.json
        settings.json
        trading.json
        wakeup.json
      secrets/
        vault.json
      workspace/
        configs/
        added-knowledge/
```

Runtime-created on demand:

- `instances/active-instance.json`
- `instances/<id>/cache/`
- `instances/<id>/data/`
- `instances/<id>/keypairs/`
- `instances/<id>/logs/`
- `instances/<id>/shell-home/`
- `instances/<id>/tmp/`
- `instances/<id>/tool-bin/`
- `instances/<id>/workspace/notes/`
- `instances/<id>/workspace/news/`
- `instances/<id>/workspace/output/`
- `instances/<id>/workspace/routines/`
- `instances/<id>/workspace/scratch/`
- `instances/<id>/workspace/strategies/`
- `instances/<id>/workspace/typescript/`

Important distinction:

- `.runtime/instances/00/` is a tracked seed instance, not an active runtime instance.
- The active runtime instance lives under `.runtime-state/instances/<id>/` or the configured external runtime root.
- Example research path: `instances/<id>/workspace/output/research/market-data/geckoterminal/ohlcv/`.

## GeckoTerminal OHLC Command

Working CLI form:

```bash
TRENCHCLAW_RUNTIME_STATE_ROOT="/absolute/path/to/trenchclaw-runtime" \
TRENCHCLAW_ACTIVE_INSTANCE_ID="00" \
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
