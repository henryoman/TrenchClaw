# Download + First-Run UX Audit (Current State)

## Exact user path today

1. User runs the install script (`curl .../install-trenchclaw.sh | sh`).
2. Script resolves OS/arch and latest GitHub release tag.
3. Script downloads `trenchclaw-<version>-<platform>.tar.gz` and matching `.sha256`.
4. Script verifies checksum before extraction.
5. Script installs versioned payload into `~/.local/share/trenchclaw/<version>` and points `~/.local/share/trenchclaw/current` symlink there.
6. Script writes a launcher at `~/.local/bin/trenchclaw` that executes the bundled binary.
7. User runs `trenchclaw`; runtime resolves release layout and serves GUI + runtime API.
8. GUI is opened by runtime and writable state defaults to `~/.trenchclaw` unless overridden.

## What is smooth already

- Download integrity check is required (sha256).
- Install is atomic-ish using temp dir + symlink swap.
- Layout auto-discovery supports both workspace and packaged release modes.
- Release packaging smoke-tests the current host artifact by launching the compiled binary and checking runtime + GUI health.

## Friction / rough edges

- Install flow has no explicit preflight command to validate host requirements before attempting downloads.
- Runtime first-run messaging does not currently include a short "what happened + where files live" recap after launch.
- Bundle currently includes `knowledge/skills/**/install.sh` files that are not required for runtime execution.
- Architecture boundary between GUI transport and runtime services is currently valid but can feel over-layered when tracing requests.

## Plan to smooth everything

### P0 (ship next)

1. Keep release bundles minimal by excluding non-runtime skill installer scripts.
2. Add tests that enforce bundle filtering + blocked-file checks to prevent regressions.
3. Keep host-platform smoke validation in release CI so packaging always exercises one real compiled artifact.

### P1

1. Add `trenchclaw doctor` command:
   - checks PATH setup,
   - verifies writable state root,
   - verifies release payload integrity metadata.
2. Improve install script output with a concise "next 3 commands" section and troubleshooting pointer.
3. Add platform-specific notes for Linux desktop browser opening behavior.

### P2 (GUI transport simplification pass)

1. Keep transport boundary for auth/session/event fanout, but flatten call path:
   - route handlers call domain services directly,
   - remove low-value adapter wrappers,
   - keep one conversion layer for API contracts only.
2. Add benchmark and test coverage around chat streaming and queue events before/after refactor.
