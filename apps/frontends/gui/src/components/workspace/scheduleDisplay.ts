import type { GuiScheduleJobView, GuiWakeupSettingsView } from "@trenchclaw/types";
import { WAKEUP_PREVIEW_ROUNDS } from "./wakeupPreview";

const MANAGED_WAKEUP_ROUTINE_NAME = "runtimeWakeup";
const MANAGED_WAKEUP_BOT_ID_PREFIX = "runtime:wakeup:";

export interface ScheduleDisplayRow {
  id: string;
  status: "upcoming" | "paused";
  routineName: string;
  botId: string;
  nextRunAt: number | null;
}

const isManagedWakeupJob = (job: GuiScheduleJobView): boolean =>
  job.routineName === MANAGED_WAKEUP_ROUTINE_NAME || job.botId.startsWith(MANAGED_WAKEUP_BOT_ID_PREFIX);

const compareScheduleDisplayRows = (left: ScheduleDisplayRow, right: ScheduleDisplayRow): number => {
  const leftTime = left.nextRunAt ?? Number.MAX_SAFE_INTEGER;
  const rightTime = right.nextRunAt ?? Number.MAX_SAFE_INTEGER;

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.id.localeCompare(right.id);
};

export const buildScheduleDisplayRows = (input: {
  jobs: GuiScheduleJobView[];
  wakeupSettings: GuiWakeupSettingsView | null;
  maxWakeupRounds?: number;
}): ScheduleDisplayRow[] => {
  const maxWakeupRounds = Math.max(0, Math.trunc(input.maxWakeupRounds ?? WAKEUP_PREVIEW_ROUNDS));
  const wakeupIntervalMs = Math.max(0, Math.trunc((input.wakeupSettings?.intervalMinutes ?? 0) * 60_000));

  return input.jobs
    .flatMap((job) => {
      if (isManagedWakeupJob(job) && job.nextRunAt !== null && wakeupIntervalMs > 0) {
        return Array.from({ length: maxWakeupRounds }, (_value, index) => ({
          id: `${job.id}:wakeup:${index + 1}`,
          status: "upcoming" as const,
          routineName: "Wakeup",
          botId: "",
          nextRunAt: job.nextRunAt! + wakeupIntervalMs * index,
        }));
      }

      return [
        {
          id: job.id,
          status: job.status,
          routineName: job.routineName,
          botId: job.botId,
          nextRunAt: job.nextRunAt,
        } satisfies ScheduleDisplayRow,
      ];
    })
    .toSorted(compareScheduleDisplayRows);
};
