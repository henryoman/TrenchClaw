# GeckoTerminal Solana API Docs

Last verified: 2026-03-22

Use this file only for GeckoTerminal data on the `solana` network.

## Fixed API Facts

- Base URL: `https://api.geckoterminal.com/api/v2`
- Fixed network: `solana`
- Recommended header: `Accept: application/json;version=20230203`
- Default content type: `application/json`
- Public API rate limit: about `10 calls/minute`
- Cache window: `1 minute`
- Freshness target: data can update as fast as `2-3 seconds` after on-chain confirmation

## TrenchClaw Runtime Download Command

TrenchClaw now exposes a runtime action and CLI command for downloading raw
GeckoTerminal OHLC JSON into the active instance workspace.

Action name:

- `downloadGeckoTerminalOhlcv`

Exact CLI form:

```bash
TRENCHCLAW_RUNTIME_STATE_ROOT="/absolute/path/to/trenchclaw-runtime-state" \
TRENCHCLAW_ACTIVE_INSTANCE_ID="01" \
bun run "src/solana/actions/execute.ts" downloadGeckoTerminalOhlcv \
  --input-json '{"poolAddress":"Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE","timeframe":"minute","aggregate":5,"limit":5}'
```

Treat that CLI form as a trusted local or internal automation path. For
model-triggered command execution, prefer a lightweight isolated shell runtime
over direct host-shell execution.

Required input fields:

- `poolAddress` GeckoTerminal Solana pool address
- `timeframe` one of `minute`, `hour`, `day`

Optional input fields:

- `aggregate` integer; allowed values depend on `timeframe`
- `beforeTimestamp` integer seconds since Unix epoch
- `limit` integer, max `1000`, default `100`
- `currency` one of `usd`, `token`
- `includeEmptyIntervals` boolean, default `false`
- `token` one of `base`, `quote`, or a token address

Timeframe and aggregate rules enforced by the runtime action:

- `minute` supports `1`, `5`, `15`
- `hour` supports `1`, `4`, `12`
- `day` supports `1`

If `aggregate` is omitted:

- GeckoTerminal uses its endpoint default behavior
- the saved filename uses `agg-default`

Runtime output location:

- `.runtime-state/instances/<id>/workspace/output/research/market-data/geckoterminal/ohlcv/`

Example real output path:

- `.runtime-state/instances/01/workspace/output/research/market-data/geckoterminal/ohlcv/czfq3xzzdmsdgduyrnltrhgc47cxcztlg4crryfu44ze-minute-agg-5-2026-03-22T07-52-35-942Z.json`

Saved filename pattern:

- `{sanitized-pool-address}-{timeframe}-agg-{aggregate-or-default}-{downloadedAtIso}.json`

Command return payload includes:

- `instanceId`
- `network`
- `source`
- `requestUrl`
- `downloadedAt`
- `candleCount`
- `latestOpenTimestamp`
- `earliestOpenTimestamp`
- `outputPath`
- `runtimePath`

Saved JSON artifact shape:

- top-level metadata such as `artifactType`, `source`, `network`, `downloadedAt`
- a `request` object containing the exact normalized input used
- `requestUrl`
- full GeckoTerminal `response`

OHLC candle row format in `response.data.attributes.ohlcv_list`:

- index `0`: open timestamp, Unix seconds
- index `1`: open
- index `2`: high
- index `3`: low
- index `4`: close
- index `5`: volume

## Request Template

```bash
curl -sS --fail \
  -H "Accept: application/json;version=20230203" \
  "https://api.geckoterminal.com/api/v2/search/pools?query=SOL&network=solana&page=1"
```

## Solana Discovery Flow

Use these endpoints in this order when you do not yet know the exact Solana
token or pool address:

1. `GET /search/pools?network=solana`
2. `GET /networks/solana/tokens/{token_address}/pools`
3. `GET /networks/solana/pools/{address}`
4. `GET /networks/solana/tokens/{address}`
5. `GET /networks/solana/pools/{pool_address}/trades`
6. `GET /networks/solana/pools/{pool_address}/ohlcv/{timeframe}`

## Solana Endpoints

### Trending and New Pools

#### `GET /networks/solana/trending_pools`

List trending Solana pools.

Parameters:

- `include` optional; available values: `base_token`, `quote_token`, `dex`
- `include_gt_community_data` optional, boolean
- `page` optional, integer, max `10`
- `duration` optional, string

#### `GET /networks/solana/new_pools`

List new Solana pools.

Parameters:

- `include` optional; available values: `base_token`, `quote_token`, `dex`
- `include_gt_community_data` optional, boolean
- `page` optional, integer, max `10`

### Pool Lookup

#### `GET /networks/solana/pools`

List top Solana pools.

Parameters:

- `include` optional; available values: `base_token`, `quote_token`, `dex`
- `include_gt_community_data` optional, boolean
- `page` optional, integer, max `10`
- `sort` optional, string

#### `GET /networks/solana/pools/{address}`

Fetch one Solana pool by pool address.

Parameters:

- `address` required, pool address
- `include` optional; available values: `base_token`, `quote_token`, `dex`
- `include_volume_breakdown` optional, boolean
- `include_composition` optional, boolean

#### `GET /networks/solana/pools/multi/{addresses}`

Fetch multiple Solana pools by pool address.

Parameters:

- `addresses` required, comma-separated pool addresses, up to `30`
- `include` optional; available values: `base_token`, `quote_token`, `dex`
- `include_volume_breakdown` optional, boolean
- `include_composition` optional, boolean

#### `GET /search/pools?network=solana`

Search Solana pools by query string.

Parameters:

- `query` optional, string
- `include` optional; available values: `base_token`, `quote_token`, `dex`
- `page` optional, integer, max `10`

### Token Lookup

#### `GET /networks/solana/tokens/{address}`

Fetch Solana token market data by token address.

Parameters:

- `address` required, token address
- `include` optional; available values: `top_pools`
- `include_composition` optional, boolean
- `include_inactive_source` optional, boolean

#### `GET /networks/solana/tokens/multi/{addresses}`

Fetch multiple Solana tokens by token address.

Parameters:

- `addresses` required, comma-separated token addresses, up to `30`
- `include_inactive_source` optional, boolean
- `include` optional; available values: `top_pools`
- `include_composition` optional, boolean

#### `GET /networks/solana/tokens/{token_address}/pools`

List top Solana pools for a token address.

Parameters:

- `token_address` required, token address
- `include` optional; available values: `base_token`, `quote_token`, `dex`
- `include_inactive_source` optional, boolean
- `page` optional, integer, max `10`
- `sort` optional, string

#### `GET /networks/solana/tokens/{address}/info`

Fetch Solana token metadata.

Metadata includes name, symbol, CoinGecko ID, image, socials, websites, and description.

Parameters:

- `address` required, token address

#### `GET /tokens/info_recently_updated?network=solana`

List the most recently updated Solana token info records.

Parameters:

- `include` optional; available values: `network`

### Simple Price Endpoint

#### `GET /simple/networks/solana/token_price/{addresses}`

Fetch token price for one or more Solana token addresses.

Parameters:

- `addresses` required, comma-separated token addresses, up to `30`
- `include_market_cap` optional, boolean
- `mcap_fdv_fallback` optional, boolean
- `include_24hr_vol` optional, boolean
- `include_24hr_price_change` optional, boolean
- `include_total_reserve_in_usd` optional, boolean
- `include_inactive_source` optional, boolean

### Pool Metadata, Trades, and Charts

#### `GET /networks/solana/pools/{pool_address}/info`

Fetch Solana pool metadata and token details for a pool.

Parameters:

- `pool_address` required, pool address
- `include` optional; available values: `pool`

#### `GET /networks/solana/pools/{pool_address}/trades`

Fetch the last `300` trades from the last `24` hours for a Solana pool.

Parameters:

- `pool_address` required, pool address
- `trade_volume_in_usd_greater_than` optional, number
- `token` optional; available values: `base`, `quote`, or a token address

#### `GET /networks/solana/pools/{pool_address}/ohlcv/{timeframe}`

Fetch OHLCV candles for a Solana pool.

Parameters:

- `pool_address` required, pool address
- `timeframe` required; allowed values: `minute`, `hour`, `day`
- `aggregate` optional, integer
- `before_timestamp` optional, seconds since epoch
- `limit` optional, max `1000`
- `currency` optional; use `usd` or `token`
- `include_empty_intervals` optional, boolean
- `token` optional; available values: `base`, `quote`, or a token address

Documented `aggregate` values:

- `day`: `1`
- `hour`: `1`, `4`, `12`
- `minute`: `1`, `5`, `15`

## High-Value Curl Examples

Search Solana pools:

```bash
curl -sS --fail \
  -H "Accept: application/json;version=20230203" \
  "https://api.geckoterminal.com/api/v2/search/pools?query=SOL&network=solana&page=1"
```

Get top pools for a Solana token:

```bash
curl -sS --fail \
  -H "Accept: application/json;version=20230203" \
  "https://api.geckoterminal.com/api/v2/networks/solana/tokens/So11111111111111111111111111111111111111112/pools?include=base_token,quote_token,dex&page=1"
```

Get Solana token price:

```bash
curl -sS --fail \
  -H "Accept: application/json;version=20230203" \
  "https://api.geckoterminal.com/api/v2/simple/networks/solana/token_price/So11111111111111111111111111111111111111112?include_24hr_price_change=true"
```

Get Solana token metadata:

```bash
curl -sS --fail \
  -H "Accept: application/json;version=20230203" \
  "https://api.geckoterminal.com/api/v2/networks/solana/tokens/So11111111111111111111111111111111111111112/info"
```

Get Solana pool data:

```bash
curl -sS --fail \
  -H "Accept: application/json;version=20230203" \
  "https://api.geckoterminal.com/api/v2/networks/solana/pools/<POOL_ADDRESS>?include=base_token,quote_token,dex"
```

Get Solana pool trades:

```bash
curl -sS --fail \
  -H "Accept: application/json;version=20230203" \
  "https://api.geckoterminal.com/api/v2/networks/solana/pools/<POOL_ADDRESS>/trades"
```

Get Solana pool OHLCV:

```bash
curl -sS --fail \
  -H "Accept: application/json;version=20230203" \
  "https://api.geckoterminal.com/api/v2/networks/solana/pools/<POOL_ADDRESS>/ohlcv/minute?aggregate=5&limit=100"
```

## Practical Notes

- Always use the `solana` network in GeckoTerminal URLs in this doc.
- Prefer `curl -sS --fail` for shell automation.
- Prefer `/search/pools?network=solana` for discovery.
- Prefer `/simple/networks/solana/token_price/...` for the fastest price lookup path.
- `multi` endpoints accept comma-separated addresses and document a limit of `30` addresses.
- Public API limits are low enough that batching and caching are usually worth it.

## Source Links

- Dex API landing page: <https://www.geckoterminal.com/dex-api>
- API guide intro: <https://apiguide.geckoterminal.com/>
- API guide getting started: <https://apiguide.geckoterminal.com/getting-started>
- Swagger JSON: <https://api.geckoterminal.com/docs/v2/swagger.json>
