# Instance Folder Reference

Use this file when you need the exact runtime folder layout the model should
understand.

## Quick Rules

- `.runtime/`
  - tracked repo contract/config only
  - not live mutable runtime state
- `.runtime-state/instances/`
  - mutable runtime state root
- `active-instance.json`
  - picks the current instance id
- `.runtime-state/instances/<id>/workspace/`
  - the only normal workspace surface the model should browse with workspace tools

## Start Here

- want the active instance id
  - read `active-instance.json`
- want model/provider/settings info
  - read `settings/ai.json`
- want instance config or trading config
  - read `settings/settings.json` or `settings/trading.json`
- want the normal model-browsable file area
  - use `workspace/`
- want generated summaries
  - use `cache/generated/workspace-context.md` and `cache/generated/knowledge-index.md`

## Minimal Layout

```text
.runtime-state/
  instances/
    active-instance.json
    <id>/
      instance.json
      settings/
        ai.json
        settings.json
        trading.json
      secrets/
        vault.json
      data/
        runtime.db
      logs/
        live/
        sessions/
        summaries/
        system/
      cache/
        generated/
          workspace-context.md
          knowledge-index.md
      keypairs/
      workspace/
```

## What Each Path Is For

- `active-instance.json`
  - selected instance pointer
- `instance.json`
  - instance identity and display info
- `settings/ai.json`
  - provider, model, and chat-generation settings
- `settings/settings.json`
  - compatibility/runtime settings for the active instance
- `settings/trading.json`
  - trading preferences and trading-specific config
- `secrets/vault.json`
  - secrets only; not normal file-reading territory
- `data/runtime.db`
  - runtime database backing state, jobs, and history
- `logs/`
  - live console, sessions, summaries, and system logs
- `cache/generated/workspace-context.md`
  - generated workspace summary
- `cache/generated/knowledge-index.md`
  - generated knowledge folder/index summary
- `keypairs/`
  - managed wallet key material
- `workspace/`
  - operator workspace for notes, configs, routines, scratch files, and outputs

## Model Rules

- use workspace tools only inside `workspace/`
- do not treat `secrets/` or `keypairs/` as normal editable file surfaces
- prefer runtime actions over direct file inspection when live state is available
- do not describe `.runtime/` as the live mutable instance folder
