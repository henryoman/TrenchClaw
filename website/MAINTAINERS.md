# Website Maintainers Guide

## Ownership Rules

- `src/routes/` owns route entrypoints and page metadata only.
- `src/lib/components/` owns reusable UI.
- `src/lib/docs/` owns the docs catalog, parsing, rendering, validation, and shared-content contract.
- `src/content/docs/` owns authored website docs.
- `src/content/shared/` owns generated copies of explicitly shared root-repo content.
- `static/` owns website-served public assets and install bootstrap entrypoints.

## Shared Repo Contract

The website is allowed to consume only these root-repo artifacts directly:

- `../ARCHITECTURE.md`
- `../scripts/install-trenchclaw.sh`

How they are used:

- `../ARCHITECTURE.md` is the canonical architecture source for `/docs/architecture`.
- `bun run content:sync` copies that file into `src/content/shared/architecture.md` before local dev/build/preview so the website catalog stays explicit and stable.
- `../scripts/install-trenchclaw.sh` remains the canonical runtime installer script. The website only hosts the platform bootstrap wrappers in `static/install/`, which fetch the canonical installer from GitHub at runtime.

## Do Not Reintroduce

- Do not add a broad “copy all root public assets into website/static” step.
- Do not create a second authored architecture document inside `website/src/content/docs/`.
- Do not hardcode homepage docs cards when they can be derived from docs metadata.

## Adding Docs

1. Add authored pages to `src/content/docs/`.
2. Add `featured: true` in frontmatter if the homepage should surface the doc.
3. If a page is sourced from the repo root, document that path in `src/lib/docs/shared-contract.ts` and keep it synced through `bun run content:sync`.
