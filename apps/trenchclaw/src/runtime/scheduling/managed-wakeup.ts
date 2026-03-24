import type { BotId } from "../../ai/contracts/types/ids";
import { createJobId } from "../../ai/contracts/types/ids";
import type { JobState, StateStore } from "../../ai/contracts/types/state";
import {
  DEFAULT_WAKEUP_SETTINGS,
  instanceWakeupSettingsSchema,
  loadInstanceWakeupSettings,
  type WakeupSettings,
} from "../settings/instance/wakeup";
import { resolveGranularDurationMs } from "./time";

export const MANAGED_WAKEUP_ROUTINE_NAME = "runtimeWakeup";
const MANAGED_WAKEUP_BOT_ID_PREFIX = "runtime:wakeup:";

const toManagedWakeupBotId = (instanceId: string): BotId =>
  `${MANAGED_WAKEUP_BOT_ID_PREFIX}${instanceId}` as BotId;

const isManagedWakeupJob = (job: JobState, instanceId: string): boolean =>
  job.routineName === MANAGED_WAKEUP_ROUTINE_NAME && job.botId === toManagedWakeupBotId(instanceId);

const isManagedWakeupEnabled = (settings: WakeupSettings): boolean =>
  settings.intervalMinutes > 0 && settings.prompt.trim().length > 0;

const createManagedWakeupConfig = (instanceId: string, settings: WakeupSettings, anchorUnixMs: number): Record<string, unknown> => ({
  managedBy: "wakeup",
  instanceId,
  intervalMs: settings.intervalMinutes * 60_000,
  intervalMinutes: settings.intervalMinutes,
  anchorUnixMs,
});

const sortWakeupJobs = (left: JobState, right: JobState): number => {
  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt - left.updatedAt;
  }
  if (left.createdAt !== right.createdAt) {
    return right.createdAt - left.createdAt;
  }
  return left.id.localeCompare(right.id);
};

const stopManagedWakeupJob = (stateStore: StateStore, job: JobState): void => {
  stateStore.updateJobStatus(job.id, "stopped", {
    config: {
      ...job.config,
      managedBy: "wakeup",
    },
    nextRunAt: undefined,
    lastError: undefined,
  });
};

export const computeAnchoredWakeupRunAt = (input: {
  anchorUnixMs: number;
  intervalMinutes: number;
  now?: number;
}): number => {
  const now = Math.max(0, Math.trunc(input.now ?? Date.now()));
  const intervalMs = resolveGranularDurationMs({
    duration: Math.max(1, Math.trunc(input.intervalMinutes)) * 60_000,
    granularity: "minutes",
    label: "wakeup interval",
  });
  const anchorUnixMs = Math.max(0, Math.trunc(input.anchorUnixMs));
  const firstRunAt = anchorUnixMs + intervalMs;

  if (now < firstRunAt) {
    return firstRunAt;
  }

  const intervalsElapsed = Math.floor((now - firstRunAt) / intervalMs) + 1;
  return firstRunAt + intervalsElapsed * intervalMs;
};

export interface LoadManagedWakeupScheduleResult {
  instanceId: string;
  settings: WakeupSettings;
  anchorUnixMs: number;
  enabled: boolean;
  nextRunAt: number | null;
}

export const loadManagedWakeupSchedule = async (instanceId: string): Promise<LoadManagedWakeupScheduleResult> => {
  const payload = await loadInstanceWakeupSettings({ instanceId });
  const parsedDocument = instanceWakeupSettingsSchema.safeParse(payload.resolvedSettings);
  const document = parsedDocument.success
    ? parsedDocument.data
    : {
        configVersion: 1 as const,
        wakeup: DEFAULT_WAKEUP_SETTINGS,
      };
  const settings = document.wakeup;
  const anchorUnixMs = document.savedAtUnixMs ?? Date.now();
  const enabled = isManagedWakeupEnabled(settings);

  return {
    instanceId,
    settings,
    anchorUnixMs,
    enabled,
    nextRunAt: enabled
      ? computeAnchoredWakeupRunAt({
          anchorUnixMs,
          intervalMinutes: settings.intervalMinutes,
        })
      : null,
  };
};

export interface SyncManagedWakeupJobInput {
  stateStore: StateStore;
  instanceId: string;
}

export interface SyncManagedWakeupJobResult {
  instanceId: string;
  enabled: boolean;
  nextRunAt: number | null;
  jobId: string | null;
}

export const syncManagedWakeupJob = async (input: SyncManagedWakeupJobInput): Promise<SyncManagedWakeupJobResult> => {
  const now = Date.now();
  const schedule = await loadManagedWakeupSchedule(input.instanceId);
  const managedJobs = input.stateStore
    .listJobs()
    .filter((job) => isManagedWakeupJob(job, input.instanceId))
    .toSorted(sortWakeupJobs);
  const runningJob = managedJobs.find((job) => job.status === "running");
  const nonRunningJobs = runningJob ? managedJobs.filter((job) => job.id !== runningJob.id) : managedJobs;
  const [primaryJob, ...duplicateJobs] = nonRunningJobs;

  for (const duplicateJob of duplicateJobs) {
    stopManagedWakeupJob(input.stateStore, duplicateJob);
  }

  if (!schedule.enabled || schedule.nextRunAt === null) {
    if (primaryJob) {
      stopManagedWakeupJob(input.stateStore, primaryJob);
    }
    return {
      instanceId: input.instanceId,
      enabled: false,
      nextRunAt: null,
      jobId: runningJob?.id ?? null,
    };
  }

  const config = createManagedWakeupConfig(input.instanceId, schedule.settings, schedule.anchorUnixMs);
  if (primaryJob) {
    input.stateStore.saveJob({
      ...primaryJob,
      botId: toManagedWakeupBotId(input.instanceId),
      routineName: MANAGED_WAKEUP_ROUTINE_NAME,
      status: "pending",
      config,
      nextRunAt: schedule.nextRunAt,
      totalCycles: 1,
      updatedAt: now,
      lastError: undefined,
    });
    return {
      instanceId: input.instanceId,
      enabled: true,
      nextRunAt: schedule.nextRunAt,
      jobId: primaryJob.id,
    };
  }

  const job: JobState = {
    id: createJobId(),
    serialNumber: input.stateStore.reserveJobSerialNumber(),
    botId: toManagedWakeupBotId(input.instanceId),
    routineName: MANAGED_WAKEUP_ROUTINE_NAME,
    status: "pending",
    config,
    cyclesCompleted: 0,
    totalCycles: 1,
    createdAt: now,
    updatedAt: now,
    nextRunAt: schedule.nextRunAt,
  };
  input.stateStore.saveJob(job);

  return {
    instanceId: input.instanceId,
    enabled: true,
    nextRunAt: schedule.nextRunAt,
    jobId: job.id,
  };
};
