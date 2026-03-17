# Release Process

TrenchClaw has one public shipping path: GitHub Releases publishing standalone `trenchclaw` binaries.

The current public release page uses GitHub-generated notes from the release workflow. Files under `releases/` are optional internal drafts unless and until the workflow is updated to publish them.

## What Gets Published

The release workflow publishes these artifacts:

- `trenchclaw-<version>-darwin-arm64.tar.gz`
- `trenchclaw-<version>-linux-x64.tar.gz`
- `trenchclaw-<version>-linux-arm64.tar.gz`
- matching `.sha256` files
- matching `*.release-metadata.json` files

Each tarball contains only:

```text
trenchclaw
gui/
core/
release-metadata.json
```

No mutable state is bundled. Databases, logs, vaults, key files, and runtime state stay in `~/.trenchclaw` on the user machine.

## Workflow

Release publishing is handled by [`.github/workflows/release.yml`](/Volumes/T9/cursor/TrenchClaw/.github/workflows/release.yml).

Trigger:

- `workflow_dispatch`

Release/version gate:

- workflow computes the next version from `package.json`
- the repo stays on `0.0.0-beta.N` for now
- each release increments only the beta number
- the workflow fails if the Git tag already exists

Job behavior:

1. `prepare_release` computes the next version with `bun run version:next`.
2. `prepare_release` validates the tag with `bun run release:validate`.
3. `prepare_release` runs `bun run lint`, `bun run typecheck`, and `bun run test`.
4. `prepare_release` writes the new `package.json` version, commits it, tags it, and pushes both commit and tag.
5. `build_release` runs once per target platform against the new tag.
6. Each matrix job builds readonly assets with `bun run app:build`.
7. Each matrix job packages one tarball with `bun run release:package`.
8. Each matrix job smoke-tests the packaged tarball with `bun run release:smoke -- --artifact-path ...`.
9. `publish` downloads all packaged artifacts and creates the GitHub Release.
10. The GitHub Release uses `generate_release_notes: true`, so the published release page currently uses GitHub-generated notes from the changes since the previous release.

Release note categories are configured by [`.github/release.yml`](/Volumes/T9/cursor/TrenchClaw/.github/release.yml).

## Release Notes

- GitHub release auto-notes are the public release message today
- `scripts/generate-release-notes.ts` is useful for commit-window inspection and drafting
- if you keep `releases/<version>.md`, treat it as an internal draft unless the workflow is changed to publish it

## Local Release Prep

For local verification before dispatching the workflow:

```bash
bun run version:next
```
