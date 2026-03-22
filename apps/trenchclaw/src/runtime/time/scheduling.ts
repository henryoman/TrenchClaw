import { z } from "zod";

export type ScheduleGranularity = "seconds" | "minutes";

const GRANULARITY_MS: Record<ScheduleGranularity, number> = {
  seconds: 1_000,
  minutes: 60_000,
};

const durationUnitMs = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

const durationStringSchema = z.string().trim().regex(/^\d+\s*(ms|s|m|h|d)$/iu);

export const scheduleDurationInputSchema = z.union([
  z.number().int().positive(),
  durationStringSchema,
]);

export type ScheduleDurationInput = z.infer<typeof scheduleDurationInputSchema>;

const parseDurationString = (value: string): number => {
  const match = value.trim().match(/^(\d+)\s*(ms|s|m|h|d)$/iu);
  if (!match) {
    throw new Error(`Unsupported duration "${value}". Use integer values like 30s, 5m, 1h, or 1d.`);
  }

  const rawAmount = Number(match[1]);
  const unit = (match[2] ?? "").toLowerCase() as keyof typeof durationUnitMs;
  if (!Number.isInteger(rawAmount) || rawAmount <= 0) {
    throw new Error(`Duration "${value}" must use a positive integer amount.`);
  }

  return rawAmount * durationUnitMs[unit];
};

export const parseScheduleDurationMs = (input: ScheduleDurationInput): number => {
  if (typeof input === "number") {
    if (!Number.isInteger(input) || input <= 0) {
      throw new Error("Duration numbers must be positive integers in milliseconds.");
    }
    return input;
  }

  return parseDurationString(input);
};

export const assertDurationMatchesGranularity = (input: {
  durationMs: number;
  granularity: ScheduleGranularity;
  label: string;
}): number => {
  const granularityMs = GRANULARITY_MS[input.granularity];
  if (input.durationMs % granularityMs !== 0) {
    throw new Error(
      `${input.label} must align to whole ${input.granularity}. Received ${input.durationMs}ms.`,
    );
  }
  return input.durationMs;
};

export const resolveGranularDurationMs = (input: {
  duration: ScheduleDurationInput;
  granularity: ScheduleGranularity;
  label: string;
}): number =>
  assertDurationMatchesGranularity({
    durationMs: parseScheduleDurationMs(input.duration),
    granularity: input.granularity,
    label: input.label,
  });

export const resolveScheduledTimeUnixMs = (input: {
  atUnixMs?: number;
  inDuration?: ScheduleDurationInput;
  now?: number;
  granularity: ScheduleGranularity;
  label: string;
}): number | undefined => {
  if (input.atUnixMs === undefined && input.inDuration === undefined) {
    return undefined;
  }
  if (input.atUnixMs !== undefined && input.inDuration !== undefined) {
    throw new Error(`Provide either ${input.label}AtUnixMs or ${input.label}In, not both.`);
  }

  if (input.atUnixMs !== undefined) {
    return Math.max(0, Math.trunc(input.atUnixMs));
  }

  const now = Math.max(0, Math.trunc(input.now ?? Date.now()));
  const durationMs = resolveGranularDurationMs({
    duration: input.inDuration!,
    granularity: input.granularity,
    label: `${input.label}In`,
  });
  return now + durationMs;
};

export const resolveIntervalDurationMs = (input: {
  intervalMs?: number;
  interval?: ScheduleDurationInput;
  granularity: ScheduleGranularity;
  label: string;
}): number | undefined => {
  if (input.intervalMs === undefined && input.interval === undefined) {
    return undefined;
  }
  if (input.intervalMs !== undefined && input.interval !== undefined) {
    throw new Error(`Provide either ${input.label}Ms or ${input.label}, not both.`);
  }

  if (input.intervalMs !== undefined) {
    return assertDurationMatchesGranularity({
      durationMs: Math.max(1, Math.trunc(input.intervalMs)),
      granularity: input.granularity,
      label: `${input.label}Ms`,
    });
  }

  return resolveGranularDurationMs({
    duration: input.interval!,
    granularity: input.granularity,
    label: input.label,
  });
};

export const deriveEvenlySpacedIntervalMs = (input: {
  startAtUnixMs: number;
  endAtUnixMs: number;
  installments: number;
  granularity: ScheduleGranularity;
  label: string;
}): number => {
  if (input.installments < 2) {
    throw new Error(`${input.label} requires at least 2 installments to derive an interval.`);
  }
  if (input.endAtUnixMs <= input.startAtUnixMs) {
    throw new Error(`${input.label} endAtUnixMs must be greater than startAtUnixMs.`);
  }

  const spanMs = input.endAtUnixMs - input.startAtUnixMs;
  const gaps = input.installments - 1;
  const granularityMs = GRANULARITY_MS[input.granularity];
  const intervalMs = Math.floor(spanMs / gaps / granularityMs) * granularityMs;
  if (intervalMs < granularityMs) {
    throw new Error(
      `${input.label} span is too short for ${input.installments} installments at ${input.granularity} granularity.`,
    );
  }
  return intervalMs;
};

export const durationGranularityToMs = (granularity: ScheduleGranularity): number =>
  GRANULARITY_MS[granularity];
