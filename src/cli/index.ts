// TrenchClaw — CLI Entrypoint
//
// Parses command-line arguments and boots the appropriate mode.
// This is invoked by `bun run` commands defined in package.json.
//
// Commands:
//   bun run dev          → Boot runtime + OpenTUI in development mode.
//   bun run start        → Boot runtime + OpenTUI in production mode.
//   bun run headless     → Boot runtime without TUI (daemon/server mode).
//   bun run cli status   → Print current bot/job status and exit.
//   bun run cli stop     → Send emergency stop to all running bots.
//   bun run cli pause <botId>  → Pause a specific bot.
//   bun run cli resume <botId> → Resume a paused bot.
//
// Boot sequence (for runtime modes):
//   1. Load environment variables.
//   2. Initialize state-store (create/migrate SQLite DB).
//   3. Initialize RPC pool with configured endpoints.
//   4. Initialize adapters (Jupiter, token-account).
//   5. Boot action registry (auto-discover actions from src/solana/actions/).
//   6. Initialize policy engine with configured rules.
//   7. Initialize scheduler (restore persisted jobs from state-store).
//   8. Initialize event bus.
//   9. Start triggers for active bots.
//  10. If TUI mode: mount OpenTUI views and start render loop.
//  11. If headless: log to stdout and wait for signals.
//
// Signal handling:
//   SIGINT / SIGTERM → graceful shutdown: pause all bots, flush state, close connections.
//
// Argument parsing:
//   Use Bun.argv or a lightweight parser (meow).
//   Keep it minimal. Most configuration comes from .env + bot config files.
