// TrenchClaw — Shared Contracts
//
// Single source of truth for all interfaces used across the runtime.
// Every module in src/ai/, src/solana/, and src/app/ imports from here.
//
// This file will contain:
//
// Action<TInput, TOutput>    — The contract every chain action implements.
//                               Fields: name, category, subcategory, inputSchema,
//                               outputSchema, precheck, execute, postcheck.
//
// ActionResult<T>            — Envelope returned by every action execution.
//                               Fields: ok, data, error, code, retryable,
//                               txSignature, durationMs, timestamp, idempotencyKey,
//                               decisionTrace.
//
// ActionContext               — Mutable state passed through a dispatch cycle.
//                               Holds wallet, RPC adapter ref, cached balances,
//                               active policy set, job metadata.
//
// ActionStep                  — A single unit of work in a routine's plan.
//                               Fields: actionName, input, dependsOn, retryPolicy.
//
// RetryPolicy                 — Retry configuration per action or step.
//                               Fields: maxAttempts, backoffMs, backoffMultiplier.
//
// Policy                      — A single policy rule evaluated by the policy engine.
//                               Fields: name, type (pre|post), evaluate function.
//
// PolicyResult                — Result of a policy evaluation.
//                               Fields: allowed, reason, policyName.
//
// BotConfig                   — Configuration for a deployed bot instance.
//                               Fields: id, name, routine, triggerConfig, policyOverrides,
//                               walletId, enabled.
//
// JobState                    — Persisted state of a scheduled job.
//                               Fields: id, botId, status, nextRunAt, lastRunAt,
//                               lastResult, cyclesCompleted, totalCycles.
//
// RuntimeEvent                — Union type of all events emitted on the event bus.
//                               Variants: action:start, action:success, action:fail,
//                               action:retry, bot:start, bot:pause, bot:stop,
//                               policy:block, rpc:failover.
//
// Zod schemas will be co-located with their TypeScript types.
// Example: ActionInputSchema and type ActionInput = z.infer<typeof ActionInputSchema>
