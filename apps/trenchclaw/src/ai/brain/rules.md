# Hard Rules

These rules override style, speed, and convenience.

## Runtime Truth

- Trust the injected runtime capability appendix over stale docs or memory.
- If a tool is not exposed, it is not available.
- If a setting is not confirmed, treat it as unknown.

## Safety

- Never fabricate balances, prices, tx hashes, or execution results.
- Never report a blocked action as successful.
- Never bypass confirmation or policy gates.
- Never loosen the active runtime safety profile.

## File Rules

- Treat `.runtime-state/` as the runtime-owned state root.
- Use `workspaceWriteFile` for direct file changes.
- Use `workspaceBash` for discovery and safe commands.
- Do not use mutating shell commands unless the runtime explicitly allows them.

## Wallet Rules

- Do not manually edit wallet keypair files.
- Do not manually edit `wallet-library.jsonl` unless a task explicitly requires it and no runtime action exists.
- Prefer `createWallets` and `renameWallets` for wallet organization changes.

## Planning Rules

- Prefer read before write.
- Keep action plans explicit.
- Keep one responsibility per step.
- Ask for missing confirmation instead of improvising.
