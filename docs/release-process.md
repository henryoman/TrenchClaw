# Release Process

TrenchClaw has one public shipping path: GitHub Releases publishing standalone `trenchclaw` binaries.

The normal release flow now uses stable version tags and GitHub-generated release notes by default.

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

Workflow input:

- `release_mode=manual` publishes the current committed version
- `release_mode=patch` auto-bumps the next patch version and uses GitHub-generated notes
- `release_mode=minor` auto-bumps the next minor version and uses GitHub-generated notes
- `release_notes_mode=auto` uses GitHub-generated notes for manual releases too
- `release_notes_mode=draft` uses `releases/<version>.md` for manual releases when you want a custom body

Release/version gate:

- `manual` mode uses the current version already present in `package.json`
- `manual` + `release_notes_mode=draft` fails if `releases/<package-version>.md` is missing
- `patch` and `minor` mode compute the next version from `package.json`
- the workflow fails if the Git tag already exists

Job behavior:

1. `prepare_release` resolves the release plan from `release_mode`.
2. `manual` mode validates the current package version and chooses auto or drafted release notes.
3. `patch` and `minor` mode compute the next version with `bun run version:next -- --strategy ...`.
4. `prepare_release` runs `bun run lint`, `bun run typecheck`, and `bun run test`.
5. `patch` and `minor` mode write the new `package.json` version, commit it, and push the commit.
6. `prepare_release` creates and pushes the git tag for the chosen release version.
7. `build_release` runs once per target platform against that tag.
8. Each matrix job builds readonly assets with `bun run app:build`.
9. Each matrix job packages one tarball with `bun run release:package`.
10. Each matrix job smoke-tests the packaged tarball with `bun run release:smoke -- --artifact-path ...`.
11. `publish` downloads all packaged artifacts and creates the GitHub Release.
12. `manual` mode publishes auto notes or `releases/<package-version>.md`; `patch` and `minor` mode use GitHub-generated notes.

Release note categories are configured by [`.github/release.yml`](/Volumes/T9/cursor/TrenchClaw/.github/release.yml).

## Release Notes

- `manual` mode can publish `releases/<version>.md` as the public release body
- `manual` mode can also use GitHub-generated release notes
- `patch` and `minor` mode publish GitHub-generated release notes from the tagged commit window
- `scripts/generate-release-notes.ts` is still useful for drafting or reviewing the auto-notes window
- the workflow fails closed if a required drafted notes file is missing

## Current Public Scope

Current public release messaging should stay narrow:

- managed wallet operations
- managed wallet reads
- Dexscreener research
- Jupiter Ultra swaps
- chat-driven local runtime workflows

Do not headline broader automation, privacy flows, or non-Ultra public swap paths until they are better proven.

## Public Download Link

Until a specific tagged asset URL is ready to promote, use the GitHub Releases page as the placeholder public download destination:

- `https://github.com/henryoman/trenchclaw/releases`

## Local Release Prep

For local verification before dispatching the workflow:

```bash
# manual/current version release
bun run release:build -- --version v0.0.0

# preview the next stable patch release
bun run version:next -- --strategy patch --current 0.0.0

# preview the next stable minor release
bun run version:next -- --strategy minor --current 0.0.0
```
