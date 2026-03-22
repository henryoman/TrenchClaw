# Release Process

TrenchClaw has one public shipping path: GitHub Releases publishing standalone `trenchclaw` binaries.

The Release workflow always builds the GitHub release body from **`scripts/generate-release-notes.ts`**: a grouped summary (conventional-commit-style heuristics) plus a **full commit appendix** (subject, hash, author, date, and multi-line bodies). This replaces GitHub’s REST “Generate release notes” option, which only produced a short summary and a link to the compare view.

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

Release publishing is handled by [`.github/workflows/release.yml`](../.github/workflows/release.yml).

Trigger:

- `workflow_dispatch`

Workflow input:

- `release_mode=manual` publishes the current committed version in `package.json`
- `release_mode=patch` auto-bumps the next patch version, commits `package.json`, tags, and publishes
- `release_mode=minor` auto-bumps the next minor version, commits `package.json`, tags, and publishes
- `release_notes_mode` applies **only** when `release_mode=manual`:
  - `auto` — release body is **only** the generated notes (full commit log)
  - `draft` — body is `releases/<package-version>.md`, then `---`, then the same generated commit log (so you can write a long narrative and still ship every commit)

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
11. `publish` checks out the tag with **full git history** (`fetch-depth: 0`), downloads artifacts, runs `bun run release:notes` to write `dist/release/github-release-body.md`, and creates the GitHub Release with that file as the body.

The file [`.github/release.yml`](../.github/release.yml) only affects GitHub’s separate “Generate release notes” API; this repository’s workflow does not use that API for publishing.

## Release Notes (local preview)

```bash
# same window the workflow will use for tag v0.0.3 (after that tag exists), or HEAD for the latest commit
bun run release:notes -- --version v0.0.3 --output dist/release/preview.md

# only the grouped + appendix sections (for stitching under your own title)
bun run release:notes -- --version v0.0.3 --template changelog-only --output dist/release/changelog.md
```

## Next release (checklist)

1. Land changes on the branch the workflow runs from (usually `main`).
2. Choose **patch** or **minor** if you want an automatic version bump and tag, or **manual** to tag the version already in `package.json`.
3. For **manual** + **draft**, add or update `releases/<version>.md` (same version string as `package.json`, no `v` prefix), e.g. copy and adapt `releases/0.0.1.md`.
4. Run `bun run release:notes -- --version vNEXT --output dist/release/preview.md` locally to review length and content.
5. Dispatch the **Release** workflow in GitHub Actions.

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
