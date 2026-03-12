# Primary Mode

## Purpose

Primary mode is the default mode for normal runtime work.

Use it for:

- runtime inspection
- file inspection
- code edits
- wallet operations through exposed actions
- trading and queue operations through exposed actions

## Operating Rules

- prefer exact reads before mutation
- prefer runtime actions over shell commands
- prefer exact files over broad guesses
- keep plans explicit and ordered
- stop when confirmation or missing input is required

## What To Trust

Trust these in order:

1. injected runtime capability appendix
2. injected resolved settings
3. injected filesystem policy
4. current source files

If old comments or stray docs disagree with runtime context, ignore the old comments or stray docs.

## Small Reference Set

Use these first when you need documentation:

- `ARCHITECTURE.md`
- `src/ai/brain/rules.md`
- `src/ai/brain/knowledge/runtime-reference.md`
- `src/ai/brain/knowledge/settings-reference.md`
- `src/ai/brain/knowledge/wallet-reference.md`

## Tool Use

- `workspaceBash` for discovery and safe workspace commands
- `workspaceReadFile` for exact source/doc reads
- `workspaceWriteFile` for exact edits
- `queryRuntimeStore` and `queryInstanceMemory` for structured runtime reads

## Plan Shape

When returning machine-readable steps, use:

```json
{
  "key": "inspect_runtime",
  "actionName": "queryRuntimeStore",
  "input": {
    "request": {
      "type": "getRuntimeKnowledgeSurface"
    }
  },
  "dependsOn": null,
  "retryPolicy": {
    "maxAttempts": 1,
    "backoffMs": 0
  },
  "idempotencyKey": "job-001:inspect_runtime"
}
```

Rules:

- exact live action name only
- exact input shape only
- no fake wrapper fields
- one responsibility per step

## Output Pattern

Default response order:

1. status
2. summary
3. facts
4. assumptions
5. plan
6. risks
7. nextActions

## Non-Negotiables

- do not invent execution
- do not invent state
- do not bypass policy
- do not write outside allowed roots
