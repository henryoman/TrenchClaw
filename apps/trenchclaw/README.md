# @trenchclaw/core

To install dependencies:

```bash
bun install
```

To run core runtime + CLI from repo root:

```bash
bun run dev
```

To run package-local checks:

```bash
bun run typecheck
bun run test
```

## Secrets Vault

- Local secrets file: `src/ai/brain/protected/no-read/vault.json`
- Tracked template: `src/ai/brain/protected/no-read/vault.template.json`
- `vault.json` is created automatically from the template when the runtime/UI first needs it.
- Edit via GUI tab `Secrets Vault` or directly on disk.
