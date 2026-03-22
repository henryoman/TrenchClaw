# Knowledge Manifest

This file is no longer the runtime source of truth.

## Canonical Source

- Knowledge files live under `src/ai/brain/knowledge/`.
- The canonical registry logic lives in `src/lib/knowledge/knowledge-index.ts`.
- Runtime tools build the knowledge menu from the actual files plus that registry logic.

## Generated Snapshot

- The runtime can generate `.runtime-state/instances/<id>/cache/generated/knowledge-index.md`.
- That generated index is the current inventory snapshot if you want a full on-disk view.

## How To Use Knowledge

- Use `listKnowledgeDocs` to browse or search the registry.
- Use `readKnowledgeDoc` only after you know the alias or exact doc name.
- Start with `runtime-reference` for runtime behavior and `settings-reference` for settings ownership.
- Treat live runtime state, enabled tools, and filesystem policy as higher authority than docs.
