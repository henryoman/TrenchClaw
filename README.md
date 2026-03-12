# TrenchClaw

TrenchClaw ships as a standalone local app. The public entrypoint is a single compiled binary named `trenchclaw`, distributed only through GitHub Releases.

## Install

macOS:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/macos-bootstrap.sh | bash
```

Linux:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | bash
```

Pin a version:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | TRENCHCLAW_VERSION=v0.0.2 bash
```

The bootstrap script only fetches the real installer. The installer:

- resolves the latest GitHub Release tag or uses `TRENCHCLAW_VERSION`
- downloads the platform tarball plus its `.sha256`
- verifies the checksum before extraction
- installs immutable app files into `~/.local/share/trenchclaw/<version>/`
- updates `~/.local/share/trenchclaw/current`
- writes the launcher to `~/.local/bin/trenchclaw`

Then run:

```bash
trenchclaw
```

## Runtime Layout

Installed app files are readonly:

```text
~/.local/share/trenchclaw/
  current -> ~/.local/share/trenchclaw/<version>
  <version>/
    trenchclaw
    gui/
    core/
    release-metadata.json
```

Mutable user state lives outside the install tree:

```text
~/.trenchclaw/
  db/
  generated/
  instances/
  protected/
    keypairs/
  user/
    vault.json
    vault.template.json
    workspace/
```

Upgrades replace the installed version under `~/.local/share/trenchclaw/` and leave `~/.trenchclaw/` untouched.

## Release Artifacts

Each GitHub Release publishes exactly these installable binaries:

- `trenchclaw-<version>-darwin-arm64.tar.gz`
- `trenchclaw-<version>-linux-x64.tar.gz`
- `trenchclaw-<version>-linux-arm64.tar.gz`

Each artifact also has:

- `trenchclaw-<version>-<platform>.tar.gz.sha256`
- `trenchclaw-<version>-<platform>.release-metadata.json`

Tarball contents are minimal:

```text
trenchclaw
gui/
core/
release-metadata.json
```

The public install flow does not install Bun, Solana CLI, Homebrew formulas, npm packages, or any other external tools by default. Optional tool requirements are surfaced at runtime when a specific feature needs them.

## Release Workflow

GitHub Actions `.github/workflows/release.yml` is the release path:

- manual `workflow_dispatch`
- inputs: `version`, `prerelease`
- validate: lint, typecheck, test
- build readonly assets
- compile the `apps/runner` binary for `darwin-arm64`, `linux-x64`, and `linux-arm64`
- package tarballs, `.sha256`, and per-artifact metadata
- smoke test each packaged tarball
- publish a GitHub Release with GitHub-generated release notes

Release note categories are configured in [`.github/release.yml`](/Volumes/T9/cursor/TrenchClaw/.github/release.yml).

## Developer From Source

Bun is required only for contributors working from source.

```bash
bun install
bun run app:build
bun run start
```

Useful commands:

- `bun run dev`
- `bun run app:build`
- `bun run release:package -- --version v0.0.2`
- `bun run release:smoke -- --artifact-path dist/release/trenchclaw-v0.0.2-linux-x64.tar.gz`

The docs website is only a bootstrap and documentation surface. GitHub Releases is the single source of truth for installable binaries.
