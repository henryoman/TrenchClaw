# Bash And CLI Playbook

Use this file when the user needs shell commands, local CLI inspection, file
browsing, or command help and you want the shortest safe routing guide.

## File Browsing

- `workspaceListDirectory`
  - use when the path is unknown
- `workspaceReadFile`
  - use when the path is known exactly
- `workspaceWriteFile`
  - use for exact allowed file creation or replacement

## Shell And CLI

- default shell tool: `workspaceBash`
- prefer typed modes first:
  - `cli`
  - `version`
  - `help`
  - `which`
  - `search_text`
  - `list_directory`
  - `http_get`
- use raw `shell` only when the typed modes are not enough

## Good Uses

- `solana --version`
- `solana config get`
- `helius --help`
- `dune --help`
- `bun --version`
- trusted local search or inspection commands inside the active workspace

## Avoid These Mistakes

- do not use bash to browse docs when `readKnowledgeDoc` or `workspaceReadFile` can do it directly
- do not treat `workspaceBash` as a full sandbox or VM
- do not use arbitrary host `bun run *.ts` as a default model action
- do not use shell when a smaller typed runtime action already exists

## If You Need More Detail

- open `commands` for the general tool-routing map
- open `solana-cli-docs`, `helius-cli-docs`, or `bash-tool-docs` for deeper command reference
