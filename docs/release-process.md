# TrenchClaw Release Process (App Bundle Phase)

This document defines the current release path while native binary packaging is still in progress.

## Scope

Release artifact currently ships:
- GUI build output
- Runner build output
- Core runtime tracked source

Release artifact intentionally does not ship:
- Local vault (`vault.json`)
- Local keypairs
- Local runtime db/events/session data
- `.env` files

## Local Release Prep Commands

```bash
bun run app:clean
bun run app:build
bun run bundle:verify
bun run release:package -- --version vX.Y.Z
bun run release:notes -- --version vX.Y.Z --output dist/release/release-notes.md
```

Outputs:
- `dist/release/trenchclaw-app-vX.Y.Z.tar.gz`
- `dist/release/trenchclaw-app-vX.Y.Z.tar.gz.sha256`
- `dist/release/release-notes.md`
- `dist/release/release-metadata.json`

## GitHub Workflows

- CI workflow: `.github/workflows/ci.yml`
  - Trigger: push + pull request
  - Gates: tests, app build, bundle verification

- Release workflow: `.github/workflows/release.yml`
  - Trigger: manual `workflow_dispatch`
  - Inputs: `version`, `prerelease`
  - Actions: validate, build bundle, package artifact, generate release notes, publish GitHub Release

Release is manual only and never auto-publishes from normal pushes.

## Changelog Source of Truth

Release notes are generated from commit subjects since the previous version tag:
- previous tag resolved via `git describe --tags --abbrev=0 --match "v*"`
- range is `previousTag..HEAD`

This ensures each release notes file includes only commits not announced in prior releases.
