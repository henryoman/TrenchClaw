// TrenchClaw — Policy Engine
//
// Evaluates risk and compliance rules before and after action execution.
// The dispatcher calls this automatically. Actions don't need to know about policies.
//
// Pre-execution checks (run before action.execute):
//   - Token allowlist/denylist: reject trades on banned tokens.
//   - Max notional per trade: reject if trade value exceeds threshold.
//   - Per-day trade caps: reject if daily volume limit reached.
//   - Max slippage by token class: reject if expected slippage too high.
//   - Cooldown timers: reject if same action ran too recently.
//   - Min liquidity: reject if pool liquidity below threshold.
//   - Max price impact: reject if Jupiter quote shows excessive impact.
//
// Post-execution checks (run after action.execute, advisory not blocking):
//   - Verify actual slippage vs expected.
//   - Check wallet balance sanity after trade.
//   - Log any anomalies for operator review.
//
// Circuit breakers:
//   - Track consecutive failures per action name.
//   - If failures exceed threshold, disable the action temporarily.
//   - Emit policy:block event with reason.
//
// Design notes:
//   - Policies are loaded from config at boot, can be overridden per-bot.
//   - Each policy implements the Policy interface from src/types/.
//   - Policy evaluation is synchronous where possible (use cached data).
//   - All policy decisions are logged to state-store for auditability.
