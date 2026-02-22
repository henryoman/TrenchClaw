// TrenchClaw — Action Registry
//
// Central registry of all available actions in the system.
// The dispatcher looks up actions here by name before executing.
//
// Responsibilities:
//   - Maintain a Map<string, Action> of all registered actions.
//   - Auto-discover action files from src/solana/actions/ at boot.
//     Walk the directory tree, import each .ts file, validate it exports
//     a conforming Action, and register it.
//   - Validate input/output schemas on registration (fail fast on bad actions).
//   - Provide lookup: registry.get("checkSolBalance") → Action definition.
//   - Provide listing: registry.list() → all registered action names + metadata.
//   - Provide filtering: registry.byCategory("wallet-based") → subset.
//
// Design notes:
//   - Actions are registered once at boot. No hot-reload (keep it simple).
//   - The registry does NOT execute actions. That's the dispatcher's job.
//   - If two actions register the same name, throw at boot. No silent overwrites.
//   - Each action's name must match its filename (checkSolBalance.ts → "checkSolBalance").
