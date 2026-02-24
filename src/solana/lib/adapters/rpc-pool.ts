// TrenchClaw — RPC Provider Pool
//
// Manages multiple Solana RPC endpoints with intelligent routing.
// This is the only module that creates Connection objects.
// Everything else in the system gets an RPC reference through ActionContext.
//
// Endpoints are configured via env vars (HELIUS_API_KEY, QUICKNODE_API_KEY, RPC_URL).
// Each endpoint gets a health score based on recent performance.
//
// Capabilities:
//   - Maintain a ranked list of endpoints by health score.
//   - Route requests to the healthiest available endpoint.
//   - Automatic failover: if primary fails, try next in rank.
//   - Health scoring: track per-endpoint error rate, p95 latency, stale-data signals.
//   - Retry policy by method class:
//       Reads  (getBalance, getTokenAccountsByOwner): retry up to 3x, fast backoff.
//       Writes (sendTransaction): retry up to 2x, slower backoff, different endpoint each attempt.
//   - Commitment level per request (processed/confirmed/finalized).
//   - Rate-limit awareness: back off if 429 received, deprioritize endpoint.
//   - Timeout budgets: configurable per method, default 10s reads / 30s writes.
//
// Interface:
//   - pool.getConnection(): Connection (best available)
//   - pool.call(method, params, opts?): Promise<T> (routed + retried)
//   - pool.health(): EndpointHealth[] (current scores for all endpoints)
//
// Emits events:
//   - rpc:failover when switching endpoints.
//
// Design notes:
//   - Built on @solana/web3.js Connection but wrapped so callers don't depend on it.
//   - Health scores persist in memory only (reset on restart is fine).
//   - Standardized around these common RPC methods:
//       getLatestBlockhash, sendTransaction, simulateTransaction,
//       getSignatureStatuses, getTransaction, getBalance,
//       getTokenAccountsByOwner, getAccountInfo, getProgramAccounts,
//       getBlockHeight, getSlot, getHealth.
