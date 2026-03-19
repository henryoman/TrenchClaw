# TrenchClaw Research Architecture: Standardized Chart Analysis, Backtesting, JSON Contract, Zod Schema, and File Structure

## Core recommendation

The best way is **not** to make `backtest.js` your standard.

For TrenchClaw, the right design is:

1. **Create a TrenchClaw-native research schema**
2. **Put any backtest library behind an adapter**
3. **Render GUI / TUI / image / LLM views from that same schema**
4. **Treat the backtester as an event engine, not as your app architecture**

That fits TrenchClaw much better because the repo already centers around **typed events**, **Bun SQLite persistence**, **queued jobs/schedules**, and multiple operator surfaces rather than a single analytics UI.

---

## Actual recommendation

**Use a custom TrenchClaw research contract as the source of truth.**

Then:

- use **Backtest Kit** as the main execution/research adapter
- use **Lightweight Charts** for the interactive GUI
- use **Vega-Lite + vl-convert** for deterministic image export
- use a **custom TUI renderer** from the same canonical JSON
- use a **separate LLM digest JSON** instead of dumping raw candles to the model

I would **not** use `backtest.js` as the backbone.

---

## Why not standardize on backtest.js

`backtest.js` can still be useful for quick TypeScript strategy tests, especially for basic OHLCV-style research. But it should be treated as a temporary adapter or sandbox, not the long-term TrenchClaw research architecture.

The reason is structural:

- it is centered around its own framework flow
- it is not the right source of truth for a multi-surface research system
- it should not define how TrenchClaw stores analysis, trades, metrics, annotations, or model-facing summaries

So:

- **as a quick sandbox**: acceptable
- **as the canonical standard**: no
- **as the research backbone for TrenchClaw**: no

---

## Why Backtest Kit is closer to the right direction

Backtest Kit is more aligned with the kind of architecture you want because it is designed more like a research/runtime system than a single fixed charting product.

It is a better candidate to sit **behind an adapter** because it already supports ideas that matter for TrenchClaw:

- async-iterator style execution for research pipelines
- event-driven flows
- graph/DAG-style execution concepts
- JSON-friendly data flows
- strategy portability ideas such as Pine-compatible workflows

That does **not** mean you should let Backtest Kit define your schema.

It means it is a more suitable engine to adapt than `backtest.js`.

---

## Do not let the chart library become your standard either

For the GUI, **Lightweight Charts** is a strong choice because it is built for fast financial chart rendering in the browser.

But it should only be the **interactive renderer**, not the canonical data standard.

For static exports, **Vega-Lite** is better as a portable chart-spec layer because:

- the chart definition is JSON
- it is deterministic
- it can be converted into static formats like SVG or PNG
- that makes it suitable for snapshots, reporting, and automation

So the standard should not be:

- the backtest library
- the chart library
- the TUI renderer
- the model prompt format

The standard should be **your own research JSON contract**.

---

# Architecture I would use

## 1. Canonical research JSON

This is the only thing that truly matters.

```ts
export type ResearchRun = {
  id: string
  createdAt: string

  market: {
    symbol: string
    venue: 'jupiter' | 'meteora' | 'raydium' | 'pumpfun' | 'custom'
    poolId?: string
    baseMint?: string
    quoteMint?: string
    timeframe: string
    timezone: 'UTC'
  }

  source: {
    candleSource: string
    tradeSource?: string
    orderBookSource?: string
    liquiditySource?: string
    snapshotHashes?: string[]
  }

  dataRefs: {
    candlesRef: string
    tradesRef?: string
    orderBookRef?: string
    liquidityRef?: string
  }

  studies: Array<{
    id: string
    kind: string
    panel: 'price' | 'volume' | 'oscillator' | 'custom'
    params: Record<string, unknown>
    seriesRef: string
  }>

  signals: Array<{
    ts: number
    kind: 'entry' | 'exit' | 'warning' | 'regime' | 'pattern'
    side?: 'long' | 'short' | 'flat'
    confidence?: number
    reasonCodes: string[]
    values?: Record<string, number | string | boolean>
  }>

  execution: {
    orders: Array<{
      ts: number
      id: string
      side: 'buy' | 'sell'
      type: 'market' | 'limit' | 'stop' | 'trigger'
      qty: number
      requestedPrice?: number
      status: 'requested' | 'rejected' | 'filled' | 'cancelled' | 'expired'
      reason?: string
    }>
    fills: Array<{
      ts: number
      orderId: string
      qty: number
      price: number
      fee: number
      slippageBps?: number
      route?: string[]
    }>
    positions: Array<{
      ts: number
      size: number
      avgEntry?: number
      realizedPnl: number
      unrealizedPnl: number
      equity: number
    }>
  }

  performance: {
    totalReturnPct: number
    maxDrawdownPct: number
    sharpe?: number
    sortino?: number
    winRate?: number
    profitFactor?: number
    expectancy?: number
    tradeCount: number
  }

  annotations: Array<{
    ts: number
    lane: 'price' | 'volume' | 'note'
    label: string
    severity?: 'info' | 'warn' | 'high'
  }>

  llmDigest: {
    regime: string
    setupSummary: string[]
    anomalies: string[]
    featureVector: Record<string, number | string | boolean>
    compactNarrative: string
  }

  render: {
    theme: 'dark' | 'light'
    preferredPanels: string[]
    preferredOverlays: string[]
  }
}
```

This object is the canonical contract that every TrenchClaw research feature should read from and write to.

---

## 2. Separate full data from model data

Do **not** make the model read 10,000 raw candles unless it absolutely has to.

Use three layers:

### Full dataset store
Store raw market data and heavy data products:

- candles
- trades
- order book snapshots
- liquidity snapshots
- swap routes
- quote histories

### Research run JSON
This is the normalized derived artifact:

- analysis metadata
- study outputs
- signals
- orders
- fills
- positions
- metrics
- annotations
- references to heavy datasets

### LLM digest JSON
This is the model-facing representation:

- compressed feature vector
- regime summary
- anomalies
- setup summary
- compact narrative
- selected time windows

The model should usually consume the **LLM digest plus small selected windows**, not the entire raw history.

---

## 3. Everything becomes adapters

### Backtest engine adapter

```ts
export interface BacktestAdapter {
  run(config: ResearchConfig): AsyncIterable<ResearchEvent>
}
```

### Renderer adapter

```ts
export interface ResearchRenderer<T> {
  render(run: ResearchRun): T
}
```

Then implement specific adapters:

- `LightweightChartsRenderer` -> GUI
- `VegaLiteRenderer` -> static image spec
- `TuiRenderer` -> ANSI / Unicode view
- `LlmDigestRenderer` -> compact JSON + markdown summary
- `BacktestKitAdapter` -> execution engine bridge
- `BacktestJsAdapter` -> optional sandbox bridge

This is what makes the system standardized.

You are not standardizing on a vendor or a package. You are standardizing on **interfaces plus schema**.

---

## 4. Event-first backtesting, not snapshot-first

Your backtest engine should emit structured events.

```ts
export type ResearchEvent =
  | { type: 'candle'; payload: CandleEvent }
  | { type: 'indicator'; payload: IndicatorEvent }
  | { type: 'signal'; payload: SignalEvent }
  | { type: 'order_requested'; payload: OrderRequestedEvent }
  | { type: 'order_rejected'; payload: OrderRejectedEvent }
  | { type: 'fill'; payload: FillEvent }
  | { type: 'position'; payload: PositionEvent }
  | { type: 'equity'; payload: EquityEvent }
  | { type: 'annotation'; payload: AnnotationEvent }
  | { type: 'done'; payload: DoneEvent }
```

Why this matters:

- the same event stream can drive the backtester
- the same event stream can populate SQLite
- the same event stream can update a TUI live
- the same event stream can update a GUI live
- the same event stream can be summarized for the model

That is much cleaner than running a backtest and then trying to reverse-engineer its results into many separate formats later.

---

## 5. Solana-specific realism layer

For TrenchClaw, candles alone are not enough.

A generic retail-style backtester will miss important execution realities.

You should extend the research contract with Solana-specific fields such as:

- pool/liquidity snapshot at signal time
- route used
- priority fee
- landing delay
- quote freshness / staleness
- expected slippage vs realized slippage
- liquidity cliff flags
- launch-phase state
- migration/freeze/halt anomalies

This is another reason not to let a generic package define the standard.

---

# Final verdict

**Do not standardize on `backtest.js`. Standardize on your own research schema.**

Then plug libraries into it.

The best long-term setup is:

- **Canonical TrenchClaw Research JSON** = source of truth
- **Backtest Kit** = main execution/research adapter
- **Custom Solana execution simulator** = realistic fills/slippage/routes
- **Lightweight Charts** = GUI renderer
- **Vega-Lite + vl-convert** = deterministic image export
- **Custom ANSI renderer** = TUI
- **Compact LLM digest generator** = model-facing layer

That gives you one contract that can be:

- viewed in the GUI
- viewed in the TUI
- exported as an image
- stored in SQLite
- understood by the model

That is the part that actually scales.

---

# Zod schema

Below is a production-style Zod schema version of the research contract.

```ts
import { z } from 'zod'

const VenueSchema = z.enum(['jupiter', 'meteora', 'raydium', 'pumpfun', 'custom'])
const StudyPanelSchema = z.enum(['price', 'volume', 'oscillator', 'custom'])
const SignalKindSchema = z.enum(['entry', 'exit', 'warning', 'regime', 'pattern'])
const SignalSideSchema = z.enum(['long', 'short', 'flat'])
const OrderSideSchema = z.enum(['buy', 'sell'])
const OrderTypeSchema = z.enum(['market', 'limit', 'stop', 'trigger'])
const OrderStatusSchema = z.enum(['requested', 'rejected', 'filled', 'cancelled', 'expired'])
const AnnotationLaneSchema = z.enum(['price', 'volume', 'note'])
const AnnotationSeveritySchema = z.enum(['info', 'warn', 'high'])
const RenderThemeSchema = z.enum(['dark', 'light'])

const ScalarValueSchema = z.union([z.number(), z.string(), z.boolean()])
const ScalarRecordSchema = z.record(z.string(), ScalarValueSchema)

export const MarketSchema = z.object({
  symbol: z.string().min(1),
  venue: VenueSchema,
  poolId: z.string().min(1).optional(),
  baseMint: z.string().min(1).optional(),
  quoteMint: z.string().min(1).optional(),
  timeframe: z.string().min(1),
  timezone: z.literal('UTC'),
})

export const SourceSchema = z.object({
  candleSource: z.string().min(1),
  tradeSource: z.string().min(1).optional(),
  orderBookSource: z.string().min(1).optional(),
  liquiditySource: z.string().min(1).optional(),
  snapshotHashes: z.array(z.string().min(1)).optional(),
})

export const DataRefsSchema = z.object({
  candlesRef: z.string().min(1),
  tradesRef: z.string().min(1).optional(),
  orderBookRef: z.string().min(1).optional(),
  liquidityRef: z.string().min(1).optional(),
})

export const StudySchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  panel: StudyPanelSchema,
  params: z.record(z.string(), z.unknown()),
  seriesRef: z.string().min(1),
})

export const SignalSchema = z.object({
  ts: z.number().int().nonnegative(),
  kind: SignalKindSchema,
  side: SignalSideSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  reasonCodes: z.array(z.string().min(1)).default([]),
  values: ScalarRecordSchema.optional(),
})

export const OrderSchema = z.object({
  ts: z.number().int().nonnegative(),
  id: z.string().min(1),
  side: OrderSideSchema,
  type: OrderTypeSchema,
  qty: z.number().positive(),
  requestedPrice: z.number().positive().optional(),
  status: OrderStatusSchema,
  reason: z.string().optional(),
})

export const FillSchema = z.object({
  ts: z.number().int().nonnegative(),
  orderId: z.string().min(1),
  qty: z.number().positive(),
  price: z.number().positive(),
  fee: z.number().min(0),
  slippageBps: z.number().optional(),
  route: z.array(z.string().min(1)).optional(),
})

export const PositionSchema = z.object({
  ts: z.number().int().nonnegative(),
  size: z.number(),
  avgEntry: z.number().positive().optional(),
  realizedPnl: z.number(),
  unrealizedPnl: z.number(),
  equity: z.number(),
})

export const ExecutionSchema = z.object({
  orders: z.array(OrderSchema),
  fills: z.array(FillSchema),
  positions: z.array(PositionSchema),
})

export const PerformanceSchema = z.object({
  totalReturnPct: z.number(),
  maxDrawdownPct: z.number(),
  sharpe: z.number().optional(),
  sortino: z.number().optional(),
  winRate: z.number().min(0).max(1).optional(),
  profitFactor: z.number().nonnegative().optional(),
  expectancy: z.number().optional(),
  tradeCount: z.number().int().nonnegative(),
})

export const AnnotationSchema = z.object({
  ts: z.number().int().nonnegative(),
  lane: AnnotationLaneSchema,
  label: z.string().min(1),
  severity: AnnotationSeveritySchema.optional(),
})

export const LlmDigestSchema = z.object({
  regime: z.string().min(1),
  setupSummary: z.array(z.string().min(1)),
  anomalies: z.array(z.string().min(1)),
  featureVector: ScalarRecordSchema,
  compactNarrative: z.string().min(1),
})

export const RenderSchema = z.object({
  theme: RenderThemeSchema,
  preferredPanels: z.array(z.string().min(1)),
  preferredOverlays: z.array(z.string().min(1)),
})

export const ResearchRunSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  market: MarketSchema,
  source: SourceSchema,
  dataRefs: DataRefsSchema,
  studies: z.array(StudySchema),
  signals: z.array(SignalSchema),
  execution: ExecutionSchema,
  performance: PerformanceSchema,
  annotations: z.array(AnnotationSchema),
  llmDigest: LlmDigestSchema,
  render: RenderSchema,
})

export type ResearchRun = z.infer<typeof ResearchRunSchema>
```

---

# Optional extended Zod schema for Solana realism

If you want the schema to support deeper TrenchClaw execution research, add a Solana execution block instead of keeping that info only in freeform notes.

```ts
export const SolanaExecutionContextSchema = z.object({
  route: z.array(z.string().min(1)).default([]),
  priorityFeeLamports: z.number().int().nonnegative().optional(),
  estimatedSlippageBps: z.number().optional(),
  realizedSlippageBps: z.number().optional(),
  landingDelayMs: z.number().int().nonnegative().optional(),
  quoteAgeMs: z.number().int().nonnegative().optional(),
  poolLiquidityUsd: z.number().nonnegative().optional(),
  launchPhase: z.enum(['prelaunch', 'launch', 'postlaunch', 'unknown']).optional(),
  anomalyFlags: z.array(z.string().min(1)).default([]),
})
```

Then you can embed it into `OrderSchema`, `FillSchema`, or both.

Example:

```ts
export const FillSchema = z.object({
  ts: z.number().int().nonnegative(),
  orderId: z.string().min(1),
  qty: z.number().positive(),
  price: z.number().positive(),
  fee: z.number().min(0),
  slippageBps: z.number().optional(),
  route: z.array(z.string().min(1)).optional(),
  solana: SolanaExecutionContextSchema.optional(),
})
```

---

# Suggested file structure

This file structure keeps the system modular and makes it obvious where the standard lives.

```text
trenchclaw/
├─ src/
│  ├─ research/
│  │  ├─ index.ts
│  │  ├─ types/
│  │  │  ├─ research-run.ts
│  │  │  ├─ research-event.ts
│  │  │  ├─ research-config.ts
│  │  │  ├─ chart-spec.ts
│  │  │  └─ llm-digest.ts
│  │  ├─ schema/
│  │  │  ├─ research-run.schema.ts
│  │  │  ├─ research-event.schema.ts
│  │  │  ├─ research-config.schema.ts
│  │  │  └─ common.schema.ts
│  │  ├─ adapters/
│  │  │  ├─ backtest/
│  │  │  │  ├─ adapter.ts
│  │  │  │  ├─ backtest-kit.adapter.ts
│  │  │  │  ├─ backtest-js.adapter.ts
│  │  │  │  └─ simulator.adapter.ts
│  │  │  ├─ data/
│  │  │  │  ├─ candles.adapter.ts
│  │  │  │  ├─ trades.adapter.ts
│  │  │  │  ├─ orderbook.adapter.ts
│  │  │  │  ├─ liquidity.adapter.ts
│  │  │  │  └─ jupiter.adapter.ts
│  │  │  ├─ render/
│  │  │  │  ├─ renderer.ts
│  │  │  │  ├─ lightweight-charts.renderer.ts
│  │  │  │  ├─ vega-lite.renderer.ts
│  │  │  │  ├─ tui.renderer.ts
│  │  │  │  ├─ markdown.renderer.ts
│  │  │  │  └─ llm-digest.renderer.ts
│  │  │  └─ storage/
│  │  │     ├─ sqlite.storage.ts
│  │  │     ├─ fs.storage.ts
│  │  │     └─ artifact.storage.ts
│  │  ├─ engine/
│  │  │  ├─ run-research.ts
│  │  │  ├─ event-bus.ts
│  │  │  ├─ projector.ts
│  │  │  ├─ metric-engine.ts
│  │  │  ├─ annotation-engine.ts
│  │  │  ├─ feature-engine.ts
│  │  │  └─ llm-digest-engine.ts
│  │  ├─ studies/
│  │  │  ├─ sma.ts
│  │  │  ├─ ema.ts
│  │  │  ├─ rsi.ts
│  │  │  ├─ atr.ts
│  │  │  ├─ volume-profile.ts
│  │  │  └─ regime-detection.ts
│  │  ├─ execution/
│  │  │  ├─ order-simulator.ts
│  │  │  ├─ slippage.ts
│  │  │  ├─ fees.ts
│  │  │  ├─ route-evaluator.ts
│  │  │  ├─ priority-fee.ts
│  │  │  └─ landing-delay.ts
│  │  ├─ export/
│  │  │  ├─ image-export.ts
│  │  │  ├─ svg-export.ts
│  │  │  ├─ png-export.ts
│  │  │  ├─ report-export.ts
│  │  │  └─ json-export.ts
│  │  ├─ tui/
│  │  │  ├─ screens/
│  │  │  │  ├─ run-summary.screen.ts
│  │  │  │  ├─ chart.screen.ts
│  │  │  │  ├─ trades.screen.ts
│  │  │  │  └─ anomalies.screen.ts
│  │  │  └─ format/
│  │  │     ├─ ansi-chart.ts
│  │  │     ├─ sparkline.ts
│  │  │     ├─ table.ts
│  │  │     └─ badges.ts
│  │  ├─ gui/
│  │  │  ├─ components/
│  │  │  │  ├─ ResearchChart.svelte
│  │  │  │  ├─ PerformancePanel.svelte
│  │  │  │  ├─ SignalList.svelte
│  │  │  │  ├─ TradeTable.svelte
│  │  │  │  └─ LlmDigestPanel.svelte
│  │  │  └─ stores/
│  │  │     ├─ research-run.store.ts
│  │  │     └─ research-events.store.ts
│  │  └─ fixtures/
│  │     ├─ sample-run.json
│  │     ├─ sample-candles.json
│  │     └─ sample-events.json
│  ├─ db/
│  │  └─ migrations/
│  │     ├─ 001_research_runs.sql
│  │     ├─ 002_research_events.sql
│  │     └─ 003_research_artifacts.sql
│  └─ routes/
│     └─ api/
│        └─ research/
│           ├─ run.ts
│           ├─ get-run.ts
│           ├─ export-image.ts
│           ├─ export-json.ts
│           └─ stream-events.ts
├─ docs/
│  └─ research-contract.md
├─ scripts/
│  ├─ run-research.ts
│  ├─ export-research-image.ts
│  └─ validate-research-run.ts
└─ package.json
```

---

# How the pieces should work together

## Ingestion flow

1. fetch or load candles, trades, order book, and liquidity data
2. normalize them into internal dataset formats
3. persist raw datasets separately
4. hand normalized streams to the research engine

## Research flow

1. strategy adapter emits events
2. projector accumulates canonical `ResearchRun`
3. metric engine computes performance fields
4. feature engine builds compact derived features
5. LLM digest engine generates model-facing digest
6. storage adapter persists run + artifacts

## Rendering flow

The renderer should never own the analysis.

It should only transform `ResearchRun` into a target output:

- GUI view model
- TUI view model
- Vega-Lite JSON spec
- markdown report
- compact LLM JSON

That is what keeps the system standardized.

---

# Example interface layer

```ts
export interface ResearchConfig {
  runId: string
  symbol: string
  timeframe: string
  venue: 'jupiter' | 'meteora' | 'raydium' | 'pumpfun' | 'custom'
  strategy: {
    kind: string
    params: Record<string, unknown>
  }
  data: {
    candlesRef: string
    tradesRef?: string
    orderBookRef?: string
    liquidityRef?: string
  }
}

export interface BacktestAdapter {
  run(config: ResearchConfig): AsyncIterable<ResearchEvent>
}

export interface ResearchRenderer<T> {
  render(run: ResearchRun): T
}

export interface ResearchStorage {
  saveRun(run: ResearchRun): Promise<void>
  saveEvents(runId: string, events: ResearchEvent[]): Promise<void>
  loadRun(runId: string): Promise<ResearchRun | null>
}
```

---

# Example minimal event schemas

```ts
import { z } from 'zod'

export const CandleEventSchema = z.object({
  ts: z.number().int().nonnegative(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nonnegative(),
})

export const IndicatorEventSchema = z.object({
  ts: z.number().int().nonnegative(),
  studyId: z.string().min(1),
  values: z.record(z.string(), z.number()),
})

export const SignalEventSchema = z.object({
  ts: z.number().int().nonnegative(),
  signal: SignalSchema,
})

export const OrderRequestedEventSchema = z.object({
  ts: z.number().int().nonnegative(),
  order: OrderSchema,
})

export const OrderRejectedEventSchema = z.object({
  ts: z.number().int().nonnegative(),
  orderId: z.string().min(1),
  reason: z.string().min(1),
})

export const FillEventSchema = z.object({
  ts: z.number().int().nonnegative(),
  fill: FillSchema,
})

export const PositionEventSchema = z.object({
  ts: z.number().int().nonnegative(),
  position: PositionSchema,
})

export const EquityEventSchema = z.object({
  ts: z.number().int().nonnegative(),
  equity: z.number(),
})

export const DoneEventSchema = z.object({
  ts: z.number().int().nonnegative(),
  runId: z.string().min(1),
})
```

---

# Recommended standardization rule

Use this rule everywhere in TrenchClaw research:

> No backtester, renderer, exporter, or model prompt is allowed to define the canonical research representation. The canonical representation is the Zod-validated `ResearchRun` plus the event stream that produces it.

That one rule prevents architecture drift.

---

# Practical implementation order

## Phase 1

Build the standard first:

- `ResearchRunSchema`
- `ResearchEvent` types
- `ResearchConfig`
- SQLite tables
- projector that turns events into `ResearchRun`

## Phase 2

Add one real engine:

- `BacktestKitAdapter`
- simple order simulator
- metrics engine

## Phase 3

Add rendering:

- GUI renderer using Lightweight Charts
- TUI renderer
- Vega-Lite image export renderer

## Phase 4

Add LLM-facing logic:

- feature engine
- digest engine
- anomaly tagging
- compact JSON output

## Phase 5

Add optional compatibility:

- `BacktestJsAdapter`
- Pine/PineTS bridge
- strategy import/export helpers

---

# Bottom line

If you want this to be smart, standardized, model-readable, GUI/TUI/image friendly, and future-proof, the correct move is:

- **own the schema**
- **own the event model**
- **treat libraries as adapters**
- **render everything from the same research contract**

That is the design that will age well inside TrenchClaw.
