# Prompt Assembly Instructions

This file is a maintainer note for how the TrenchClaw system prompt is assembled.

## Source Of Truth

The canonical prompt assembly config is:

- `src/ai/brain/protected/system/payload-manifest.yaml`

Do not guess prompt order from memory. Read the manifest and follow it exactly.

## Default Mode

- Default mode: `operator`
- Mode title comes from the active entry in `payload-manifest.yaml`

## Deterministic Prompt Order

When building the final system payload:

1. Load `payload-manifest.yaml`.
2. Resolve the active mode. If no mode is provided, use the manifest default.
3. Read each declared section in manifest order.
4. For `kind: file`, read the file at the declared path.
5. For `kind: generated`, render the declared generated section.
6. Concatenate sections in exact order.
7. After the full system payload is built, process the user message.

## Current Operator Mode Order

At the time of writing, `operator` mode reads sections in this order:

1. `system.md`
2. `modes/operator.md`
3. generated `runtimeCapabilityAppendix`
4. `../context/workspace-and-schema.md`
5. generated `knowledgeManifest`
6. generated `workspaceDirectoryTree`
7. generated `filesystemPolicy`
8. generated `resolvedUserSettings`

## Editing Rule

If you want to change prompt order, add context, remove context, or swap files, edit:

- `src/ai/brain/protected/system/payload-manifest.yaml`

Do not hardcode prompt order anywhere else unless the loader contract itself is changing.

