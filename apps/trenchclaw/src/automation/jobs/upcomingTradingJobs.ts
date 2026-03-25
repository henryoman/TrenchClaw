import type { JobState, StateStore } from "../../ai/contracts/types/state";

const UPCOMING_TRADING_JOB_STATUSES = new Set<JobState["status"]>(["pending", "paused"]);
const TRADING_ACTION_NAMES = new Set([
  "managedSwap",
  "managedUltraSwap",
  "ultraSwap",
  "privacySwap",
]);

export interface UpcomingTradingJobView {
  id: string;
  serialNumber: number | null;
  botId: string;
  routineName: string;
  status: JobState["status"];
  nextRunAt: number;
  createdAt: number;
  updatedAt: number;
  tradingRoutineId: string | null;
  kind: string | null;
  executionMode: string | null;
  swapProvider: string | null;
  stepCount: number;
  summary: string | null;
}

type TradingStepInput = {
  actionName?: unknown;
  input?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const toNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getTradingSteps = (job: JobState): TradingStepInput[] => {
  const rawSteps = job.config.steps;
  if (!Array.isArray(rawSteps)) {
    return [];
  }
  return rawSteps.filter((step): step is TradingStepInput => isRecord(step));
};

const findFirstTradingStep = (job: JobState): TradingStepInput | null =>
  getTradingSteps(job).find((step) => TRADING_ACTION_NAMES.has(toNonEmptyString(step.actionName) ?? "")) ?? null;

const resolveTradingKind = (job: JobState): string | null => {
  const configKind = toNonEmptyString(job.config.kind);
  if (configKind) {
    return configKind;
  }

  const configType = toNonEmptyString(job.config.type);
  if (configType === "managedUltraSwapSchedule") {
    return "swap_once";
  }
  if (configType === "managedUltraSwapDca") {
    return "dca";
  }
  return findFirstTradingStep(job) ? "action_sequence" : null;
};

const resolveSwapProvider = (job: JobState): string | null => {
  const configuredProvider = toNonEmptyString(job.config.swapProvider);
  if (configuredProvider) {
    return configuredProvider;
  }

  const step = findFirstTradingStep(job);
  const actionName = toNonEmptyString(step?.actionName);
  if (actionName === "managedUltraSwap" || actionName === "ultraSwap") {
    return "ultra";
  }
  return null;
};

const summarizeTradingStep = (step: TradingStepInput | null): string | null => {
  if (!step || !isRecord(step.input)) {
    return null;
  }

  const actionName = toNonEmptyString(step.actionName);
  const inputCoin = toNonEmptyString(step.input.inputCoin);
  const outputCoin = toNonEmptyString(step.input.outputCoin);
  const amount = step.input.amount;
  const wallet = toNonEmptyString(step.input.wallet);
  const walletGroup = toNonEmptyString(step.input.walletGroup);
  const walletName = toNonEmptyString(step.input.walletName);

  const parts: string[] = [];
  if (actionName) {
    parts.push(actionName);
  }
  if (inputCoin && outputCoin) {
    parts.push(`${inputCoin} -> ${outputCoin}`);
  }
  if (typeof amount === "string" || typeof amount === "number") {
    parts.push(`amount=${String(amount)}`);
  }
  if (wallet) {
    parts.push(`wallet=${wallet}`);
  } else if (walletGroup && walletName) {
    parts.push(`wallet=${walletGroup}.${walletName}`);
  }

  return parts.length > 0 ? parts.join(" | ") : null;
};

const isUpcomingTradingJob = (job: JobState, now: number): boolean => {
  if (!UPCOMING_TRADING_JOB_STATUSES.has(job.status)) {
    return false;
  }
  if (typeof job.nextRunAt !== "number" || job.nextRunAt <= now) {
    return false;
  }

  if (resolveTradingKind(job)) {
    return true;
  }
  return getTradingSteps(job).some((step) => TRADING_ACTION_NAMES.has(toNonEmptyString(step.actionName) ?? ""));
};

export const listUpcomingTradingJobs = (
  stateStore: StateStore,
  input?: {
    limit?: number;
    now?: number;
  },
): UpcomingTradingJobView[] => {
  const now = Math.max(0, Math.trunc(input?.now ?? Date.now()));
  const limit = Math.max(1, Math.trunc(input?.limit ?? 10));

  return stateStore
    .listJobs()
    .filter((job) => isUpcomingTradingJob(job, now))
    .toSorted((left, right) => {
      const nextRunAtDelta = (left.nextRunAt ?? Number.MAX_SAFE_INTEGER) - (right.nextRunAt ?? Number.MAX_SAFE_INTEGER);
      if (nextRunAtDelta !== 0) {
        return nextRunAtDelta;
      }
      return left.id.localeCompare(right.id);
    })
    .slice(0, limit)
    .map((job) => ({
      id: job.id,
      serialNumber: job.serialNumber ?? null,
      botId: job.botId,
      routineName: job.routineName,
      status: job.status,
      nextRunAt: job.nextRunAt!,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      tradingRoutineId: toNonEmptyString(job.config.tradingRoutineId),
      kind: resolveTradingKind(job),
      executionMode: toNonEmptyString(job.config.executionMode),
      swapProvider: resolveSwapProvider(job),
      stepCount: getTradingSteps(job).length,
      summary: summarizeTradingStep(findFirstTradingStep(job)),
    }));
};
