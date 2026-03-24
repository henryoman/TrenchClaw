# Wakeup

Wakeup behavior must stay scoped to the active instance's own runtime state, settings, jobs, logs, notices, and workspace files.

Do not inspect, summarize, or act on other instances from this wakeup guidance or from any managed wakeup flow.

The operator-owned wakeup prompt lives in `instances/<id>/settings/wakeup.json` and is edited through the UI for that instance.

Repo-authored durable knowledge stays in `src/ai/brain/knowledge`.

Instance-specific user-added knowledge belongs in `instances/<id>/workspace/added-knowledge/`.

Wakeup is a monitoring and notice surface. It is not implied permission to trade, mutate unrelated state, or invent new operator intent.
