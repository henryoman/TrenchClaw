# Workspace Rules

- Command execution root: `.runtime-state/user/workspace`
- Default writable folders:
  - `strategies/`
  - `configs/`
  - `typescript/`
  - `notes/`
  - `scratch/`
  - `output/`
- Use `workspaceWriteFile` for creating/updating files.
- Use `workspaceBash` for discovery/search/read-only commands (`ls`, `find`, `rg`, `cat`, etc.).
- Mutating shell commands are blocked by default.
- Trusted sessions can opt in by setting `TRENCHCLAW_WORKSPACE_BASH_ALLOW_MUTATIONS=1`.
