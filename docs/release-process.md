# TrenchClaw Release Process (Standalone Phase)

This document defines the standalone release flow for macOS and Linux.

## Scope

Release artifacts currently ship:
- standalone `trenchclaw` executable for each target
- GUI build output
- readonly core brain/config/template assets

Release artifact intentionally does not ship:
- Local vault (`vault.json`)
- Local keypairs
- Local runtime db/session/log/memory data
- `.env` files
- Bun runtime installers or setup scripts

## Local Release Prep Commands

```bash
bun run app:clean
bun run app:build
bun run bundle:verify
bun run release:package -- --version vX.Y.Z
bun run release:notes -- --version vX.Y.Z --output dist/release/release-notes.md
```

Outputs:
- `dist/release/trenchclaw-vX.Y.Z-darwin-arm64.tar.gz`
- `dist/release/trenchclaw-vX.Y.Z-linux-x64.tar.gz`
- `dist/release/trenchclaw-vX.Y.Z-linux-arm64.tar.gz`
- matching `.sha256` files
- `dist/release/release-notes.md`
- `dist/release/release-metadata.json`

## Versioning Readiness (Manual Only)

Prepared commands:

```bash
bun run version:next
bun run version:next:beta
bun run version:next:patch
```

Nothing auto-bumps versions in CI/release workflows yet.
See `docs/versioning-strategy.md` for exact increment behavior.

## GitHub Workflows

- CI workflow: `.github/workflows/ci.yml`
  - Trigger: push + pull request
  - Gates: tests, app build, bundle verification

- Release workflow: `.github/workflows/release.yml`
  - Trigger: manual `workflow_dispatch`
  - Inputs: `version`, `prerelease`
  - Actions: validate, build readonly assets, compile per-target standalone binaries, smoke-test each packaged artifact, generate release notes, publish GitHub Release

Release is manual only and never auto-publishes from normal pushes.

## Changelog Source of Truth

Release notes are generated from the full commit window since the previous version tag:
- previous tag is resolved from reachable `v*` tags
- the current release tag is excluded from the previous-tag lookup when it already exists at `HEAD`
- range is `previousTag..currentTag` when the tag already exists, otherwise `previousTag..HEAD`

Each release notes file contains:
- a grouped summary by commit type
- a full appendix with every commit’s author/date/SHA/body details in the release window
