# AGENTS.md

This file is for coding agents working in `/Volumes/T9/cursor/TrenchClaw`.

## Repository Shape

- Monorepo managed with Bun workspaces and Turbo.
- Main packages: `apps/trenchclaw`, `apps/runner`, `apps/frontends/gui`, `website`, `apps/types`.
- Tests live mostly in the top-level `tests/` directory.
- Bun test preloads `tests/setup.ts` via `bunfig.toml`.

## Rule Files

- No repo-level `.cursorrules` file was found.
- No `.cursor/rules/` directory was found.
- No `.github/copilot-instructions.md` file was found.
- Follow this file plus the existing code patterns in the repo.

## Core Commands

- Install deps: `bun install`
- Run all lint/typecheck/test/build: `bun run ci`
- Run full monorepo lint/typecheck/test: `bun run lint`, `bun run typecheck`, `bun run test`
- Run full monorepo build: `bun run build:all`
- Run stronger verification pass: `bun run check:all`
- Run strongest verification including chat smoke: `bun run check:all:with-chat`

## App / Runtime Commands

- Build packaged app bundle: `bun run app:build`
- Start runner directly: `bun run app:start`
- Build and launch packaged app: `bun run launch`
- Launch release-style app: `bun run launch:release`
- Start dev bootstrap flow: `bun run dev`
- Initialize external dev runtime: `bun run dev:runtime:init`
- Clone instance state into dev runtime: `bun run dev:instance:clone -- --from-root <src> --to-root ~/.trenchclaw-dev-runtime --from-instance 01 --to-instance 01 --parts wallets,db,settings`
- Clean build artifacts: `bun run cleanup:build`

## Core Package Commands

Run from repo root unless noted.

- Core lint: `bun run --cwd apps/trenchclaw lint`
- Core lint fix: `bun run --cwd apps/trenchclaw lint:fix`
- Core typecheck: `bun run --cwd apps/trenchclaw typecheck`
- Core tests: `bun run --cwd apps/trenchclaw test`
- Core build: `bun run --cwd apps/trenchclaw build`
- Refresh generated context/knowledge: `bun run --cwd apps/trenchclaw generate`
- Start runtime server only: `bun run --cwd apps/trenchclaw runtime:start`

## Runner Commands

- Runner lint: `bun run --cwd apps/runner lint`
- Runner lint fix: `bun run --cwd apps/runner lint:fix`
- Runner typecheck: `bun run --cwd apps/runner typecheck`
- Runner build: `bun run --cwd apps/runner build`

## GUI Commands

- GUI dev via root bootstrap: `bun run gui:dev`
- GUI standalone dev server: `bun run --cwd apps/frontends/gui dev:standalone`
- GUI build/lint/typecheck: `bun run frontend:build`, `bun run frontend:lint`, `bun run frontend:typecheck`
- GUI package-local lint: `bun run --cwd apps/frontends/gui lint`
- GUI package-local typecheck: `bun run --cwd apps/frontends/gui typecheck`

## Website Commands

- Website dev: `bun run website:dev`
- Website lint/test/typecheck: `bun run website:lint`, `bun run website:test`, `bun run website:typecheck`
- Website Svelte check: `bun run website:svelte-check`
- Website build: `bun run website:build`
- Website full CI pass: `bun run website:ci`
- Website content sync only: `bun run --cwd website content:sync`

## Test Commands

- All tests / app-focused CI / website-only: `bun run test`, `bun run appci`, `bun run website:test`
- Runtime chat focused suite: `bun run test:runtime-chat`
- Launch chat smoke: `bun run test:launch-chat`

## Running One Test File

- Single top-level test file: `bun test tests/runtime/chat-service.test.ts`
- Another example: `bun test tests/website/smoke.test.ts`
- Multiple explicit files: `bun test tests/runtime/chat-service.test.ts tests/frontends/gui-transport.test.ts`
- From `website/`, website tests use relative paths like: `bun test ../tests/website`

## Running One Test or Describe Block

- Bun supports test-name filtering.
- Single named test example: `bun test tests/runtime/chat-service.test.ts -t "maps timeout failures to explicit runtime chat errors"`
- Prefer file + name filtering together for speed and determinism.

## Lint / Typecheck Expectations

- Linting uses `oxlint` across the repo.
- Root config is `.oxlintrc.json`.
- Browser env overrides exist for `apps/frontends/gui/**` and `website/**`.
- Generated/build outputs are ignored: `dist/`, `build/`, `.svelte-kit/`, `node_modules/`, `coverage/`.
- Typechecking is TypeScript-first; do not skip it after non-trivial changes.

## Code Style

- Use TypeScript ESM everywhere.
- Use double quotes and semicolons in TS/JS files.
- Prefer `const`; use `let` only when reassignment is necessary.
- Prefer small pure helper functions for normalization, parsing, and formatting.
- Keep functions and conditionals compact unless complexity truly requires expansion.
- Preserve existing indentation and spacing; do not introduce a new formatting style.

## Imports

- Keep imports at the top of the file.
- Group `import type` separately when the file already does so.
- In SvelteKit website code, use path aliases like `$lib/...` and `$app/...` when the file already does.
- Avoid unused imports; oxlint will flag many cases.

## Types and Schemas

- Prefer explicit types for public APIs and exported helpers.
- Use `interface` for exported object shapes that are meant to be extended or consumed broadly.
- This repo uses Zod heavily; when adding input/config/state contracts, prefer a Zod schema plus exported inferred types.
- Common pattern: schema first, inferred type export, parse/validate at boundaries.

## Naming Conventions

- `PascalCase` for types, interfaces, classes, and Svelte components.
- `camelCase` for variables, functions, and object properties.
- `SCREAMING_SNAKE_CASE` for true constants and env-like keys.
- Use descriptive names over abbreviations, especially in runtime, policy, wallet, and settings code.
- Match existing domain terms exactly: `runtime`, `instance`, `managed`, `settings`, `capabilities`, `wakeup`, `schedule`, `Ultra`, `Dexscreener`, `Helius`.

## Error Handling

- Fail fast at boundaries with clear `Error` messages.
- Include relevant path, provider, or operation context in thrown errors.
- Convert unknown errors into user-facing text explicitly in UI code; do not leak raw ambiguous values into the interface.
- Validate untrusted data at the edge before deeper processing.

## Testing Style

- Tests use `bun:test` with `describe`, `test`, `expect`, `beforeEach`, `afterEach`.
- Keep tests explicit and scenario-driven.
- Prefer real file paths and realistic fixtures over over-abstracted mocks when possible.
- Name tests as behaviors, not implementation details.
- When touching runtime behavior, update or add tests under `tests/runtime/**`, `tests/solana/**`, `tests/frontends/**`, or `tests/website/**` as appropriate.

## Svelte / Frontend Notes

- This repo uses Svelte 5.
- For `.svelte`, `.svelte.ts`, or `.svelte.js` work, follow existing Svelte 5 patterns and validate with `bun run --cwd website typecheck` or the GUI equivalent.
- Do not hand-edit generated website sync outputs when the source lives elsewhere; update the canonical source and rerun `bun run --cwd website content:sync`.
- Preserve the established website visual language unless the task explicitly asks for redesign.

## Repo-Specific Workflow Notes

- Mutable runtime state should live outside the repo; do not commit personal runtime state, wallets, vaults, or generated caches.
- `.runtime/` is tracked contract/config, not live mutable state.
- Public install endpoints are generated from root scripts:
  - `scripts/install-trenchclaw.sh` -> `website/static/install`
  - `scripts/install-required-tools.sh` -> `website/static/install-tools`

## Agent Guidance

- Before editing, check whether the change belongs in core runtime, runner, GUI, website, or tests.
- After non-trivial TS changes, run at least lint + relevant tests + relevant typecheck.
- After website changes, usually run: `bun run --cwd website test` and `bun run --cwd website typecheck`.
- After Svelte changes, also run the relevant Svelte check/typecheck command.
- Prefer small, surgical diffs that match local patterns over broad refactors.
