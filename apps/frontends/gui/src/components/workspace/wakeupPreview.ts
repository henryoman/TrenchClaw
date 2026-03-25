import type { GuiScheduleJobView, GuiWakeupSettingsView } from "@trenchclaw/types";

const MANAGED_WAKEUP_ROUTINE_NAME = "runtimeWakeup";
const MANAGED_WAKEUP_BOT_ID_PREFIX = "runtime:wakeup:";

export const WAKEUP_PREVIEW_ROUNDS = 10;

export interface WakeupSchedulePreviewEntry {
  id: string;
  kind: "wakeup" | "scheduled-job";
  at: number;
  title: string;
  subtitle: string;
  repeat: string;
  status: string;
}

const isManagedWakeupJob = (job: GuiScheduleJobView): boolean =>
  job.routineName === MANAGED_WAKEUP_ROUTINE_NAME || job.botId.startsWith(MANAGED_WAKEUP_BOT_ID_PREFIX);

const formatInterval = (intervalMs: number): string => {
  if (intervalMs < 1_000) {
    return `${intervalMs}ms`;
  }
  if (intervalMs % 3_600_000 === 0) {
    return `${intervalMs / 3_600_000}h`;
  }
  if (intervalMs % 60_000 === 0) {
    return `${intervalMs / 60_000}m`;
  }
  if (intervalMs % 1_000 === 0) {
    return `${intervalMs / 1_000}s`;
  }
  return `${intervalMs}ms`;
};

const comparePreviewEntries = (left: WakeupSchedulePreviewEntry, right: WakeupSchedulePreviewEntry): number => {
  if (left.at !== right.at) {
    return left.at - right.at;
  }

  if (left.kind !== right.kind) {
    return left.kind === "wakeup" ? -1 : 1;
  }

  return left.id.localeCompare(right.id);
};

export const formatWakeupPreviewTime = (unixMs: number): string =>
  new Date(unixMs).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export const buildWakeupSchedulePreview = (input: {
  jobs: GuiScheduleJobView[];
  wakeupSettings: GuiWakeupSettingsView | null;
  now: number;
  maxWakeupRounds?: number;
}): WakeupSchedulePreviewEntry[] => {
  const futureJobs = input.jobs.filter((job) => job.nextRunAt !== null && job.nextRunAt > input.now);
  const managedWakeupJob = futureJobs.find((job) => isManagedWakeupJob(job));
  const maxWakeupRounds = Math.max(0, Math.trunc(input.maxWakeupRounds ?? WAKEUP_PREVIEW_ROUNDS));
  const managedWakeupNextRunAt = managedWakeupJob?.nextRunAt ?? null;
  const managedWakeupIntervalMs = Math.max(0, Math.trunc((input.wakeupSettings?.intervalMinutes ?? 0) * 60_000));

  const projectedWakeups = managedWakeupJob && managedWakeupNextRunAt !== null && managedWakeupIntervalMs > 0
    ? Array.from({ length: maxWakeupRounds }, (_value, index) => ({
        id: `wakeup-${index + 1}-${managedWakeupNextRunAt + managedWakeupIntervalMs * index}`,
      kind: "wakeup" as const,
      at: managedWakeupNextRunAt + managedWakeupIntervalMs * index,
      title: "Wakeup",
      subtitle: "",
      repeat: `Every ${formatInterval(managedWakeupIntervalMs)}`,
      status: "scheduled",
    }))
    : [];

  const scheduledJobs = futureJobs
    .filter((job) => !isManagedWakeupJob(job))
    .map((job) => ({
      id: job.id,
      kind: "scheduled-job" as const,
      at: job.nextRunAt!,
      title: job.routineName,
      subtitle: `${job.botId}${job.serialNumber !== null ? ` • #${job.serialNumber}` : ""}`,
      repeat: "Scheduled",
      status: job.status,
    }));

  return [...projectedWakeups, ...scheduledJobs].toSorted(comparePreviewEntries);
};
