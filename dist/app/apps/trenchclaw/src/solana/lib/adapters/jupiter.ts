// TrenchClaw — Jupiter Adapter
//
// Wraps the Jupiter aggregator API for quoting and executing swaps.
// Used exclusively by swap actions (quoteSwap, executeSwap).
//
// API version: Jupiter v6 (https://quote-api.jup.ag/v6/)
//
// Capabilities:
//   - Quote: get best route for a token pair + amount.
//       Input:  inputMint, outputMint, amount (in smallest units), slippageBps.
//       Output: route data, expected output, price impact, route plan.
//   - Swap: serialize + sign + send a swap transaction.
//       Input:  quoteResponse (from quote), wallet public key.
//       Output: serialized versioned transaction ready to sign.
//   - Route comparison: when multiple routes available, expose all for analysis.
//   - Priority fees: configurable priority fee (lamports) per swap.
//
// Token decimal handling:
//   - Resolve decimals via token-account adapter, not hardcoded.
//   - Convert human-readable amounts to/from smallest units.
//
// Error mapping:
//   - COULD_NOT_FIND_ANY_ROUTE → no liquidity / no route.
//   - Quote failures → structured error with context.
//   - Transaction failures → extract logs if available.
//
// Design notes:
//   - Uses native fetch() (built into Bun).
//   - Does NOT send transactions. Returns serialized tx for the action to sign+send
//     via the RPC pool. Keeps signing authority with the action layer.
//   - Stateless. No caching. Each call hits the API fresh for accurate pricing.
