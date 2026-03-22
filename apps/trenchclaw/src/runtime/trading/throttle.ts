import type { RuntimeSettings } from "../load";

export interface TokenBucketLaneConfig {
  enabled: boolean;
  requestsPerWindow: number;
  windowMs: number;
  maxBurst: number;
  minSpacingMs: number;
}

interface TokenBucketLaneDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RuntimeActionThrottleContract {
  acquire(actionName: string): Promise<void>;
}

type TradingThrottleLaneName = keyof RuntimeSettings["runtime"]["tradingThrottle"]["lanes"];

const ACTION_LANE_MAP: Readonly<Record<string, TradingThrottleLaneName>> = {
  managedSwap: "swapExecution",
  managedUltraSwap: "swapExecution",
  ultraQuoteSwap: "swapExecution",
  ultraExecuteSwap: "swapExecution",
  ultraSwap: "swapExecution",
  privacySwap: "swapExecution",
};

const defaultSleep = async (ms: number): Promise<void> => {
  await Bun.sleep(ms);
};

export class TokenBucketLane {
  private tokens: number;
  private lastRefillAt: number;
  private nextAllowedAt: number;

  constructor(
    private readonly config: TokenBucketLaneConfig,
    private readonly deps: TokenBucketLaneDeps = {},
  ) {
    const now = this.now();
    this.tokens = config.maxBurst;
    this.lastRefillAt = now;
    this.nextAllowedAt = now;
  }

  async acquire(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    while (true) {
      const now = this.now();
      this.refill(now);

      const spacingWaitMs = Math.max(0, this.nextAllowedAt - now);
      const missingTokens = Math.max(0, 1 - this.tokens);
      const refillWaitMs =
        missingTokens > 0 ? Math.ceil(missingTokens / this.refillRatePerMs()) : 0;
      const waitMs = Math.max(spacingWaitMs, refillWaitMs);

      if (waitMs > 0) {
        await this.sleep(waitMs);
        continue;
      }

      this.tokens = Math.max(0, this.tokens - 1);
      this.nextAllowedAt = Math.max(now, this.nextAllowedAt) + this.config.minSpacingMs;
      return;
    }
  }

  snapshot(): {
    tokens: number;
    lastRefillAt: number;
    nextAllowedAt: number;
  } {
    return {
      tokens: this.tokens,
      lastRefillAt: this.lastRefillAt,
      nextAllowedAt: this.nextAllowedAt,
    };
  }

  private refill(now: number): void {
    const elapsedMs = Math.max(0, now - this.lastRefillAt);
    if (elapsedMs === 0) {
      return;
    }

    const replenished = elapsedMs * this.refillRatePerMs();
    this.tokens = Math.min(this.config.maxBurst, this.tokens + replenished);
    this.lastRefillAt = now;
  }

  private refillRatePerMs(): number {
    return this.config.requestsPerWindow / this.config.windowMs;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private async sleep(ms: number): Promise<void> {
    await (this.deps.sleep ?? defaultSleep)(Math.max(0, Math.ceil(ms)));
  }
}

export class RuntimeActionThrottle implements RuntimeActionThrottleContract {
  private readonly lanes = new Map<TradingThrottleLaneName, TokenBucketLane>();

  constructor(
    settings: RuntimeSettings["runtime"]["tradingThrottle"],
    deps: TokenBucketLaneDeps = {},
  ) {
    if (!settings.enabled) {
      return;
    }

    (Object.entries(settings.lanes) as Array<
      [TradingThrottleLaneName, RuntimeSettings["runtime"]["tradingThrottle"]["lanes"][TradingThrottleLaneName]]
    >).forEach(([laneName, laneConfig]) => {
      this.lanes.set(
        laneName,
        new TokenBucketLane(
          {
            enabled: laneConfig.enabled,
            requestsPerWindow: laneConfig.requestsPerWindow,
            windowMs: laneConfig.windowMs,
            maxBurst: laneConfig.maxBurst,
            minSpacingMs: laneConfig.minSpacingMs,
          },
          deps,
        ),
      );
    });
  }

  async acquire(actionName: string): Promise<void> {
    const laneName = ACTION_LANE_MAP[actionName];
    if (!laneName) {
      return;
    }

    const lane = this.lanes.get(laneName);
    if (!lane) {
      return;
    }

    await lane.acquire();
  }
}

export const createRuntimeActionThrottle = (
  settings: RuntimeSettings,
): RuntimeActionThrottleContract => new RuntimeActionThrottle(settings.runtime.tradingThrottle);
