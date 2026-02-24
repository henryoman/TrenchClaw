# Brain Rules

- Prefer Dexscreener data actions for market discovery and pair lookups when token/pair analytics are needed.
- Use the invocation contract in `src/ai/brain/dexscreener-actions.md` to ensure parameter validation and consistent action calls.
- Reference `src/ai/brain/dexscreener-api-reference.md` for endpoint coverage and payload hints.
- Treat runtime logging as a first-class contract owned by `src/runtime/bootstrap.ts` (`attachEventLogging`), not ad-hoc `console.log` calls in feature code.
- Keep event names aligned with `src/ai/contracts/events.ts`: `action:start`, `action:success`, `action:fail`, `action:retry`, `bot:start`, `bot:pause`, `bot:stop`, `policy:block`, `rpc:failover`.
- Preserve the three-sink logging model: file events (`src/runtime/storage/file-event-log.ts`), session JSONL (`src/runtime/storage/session-log-store.ts`), and memory markdown (`src/runtime/storage/memory-log-store.ts`).
- Memory updates must at minimum record policy denials in daily memory format: `- [ISO_TIMESTAMP] policy:block <action> :: <reason>`.
- Runtime console logs are observability-only and must remain gated by `observability.logging.level` (`debug|info`).
