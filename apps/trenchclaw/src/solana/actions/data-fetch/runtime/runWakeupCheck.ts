import { z } from "zod";

import type { Action } from "../../../../ai/contracts/types/action";
import type { JobState, StateStore } from "../../../../ai/contracts/types/state";
import { resolveCurrentActiveInstanceIdSync } from "../../../../runtime/instance/state";
import { persistRuntimeNotice } from "../../../../runtime/runtime-notices";
import {
  loadManagedWakeupSchedule,
  MANAGED_WAKEUP_ROUTINE_NAME,
  syncManagedWakeupJob,
} from "../../../../runtime/scheduling/managed-wakeup";

const wakeupTriggerSchema = z.enum(["scheduled", "boot", "manual"]);

const runWakeupCheckInputSchema = z.object({
  instanceId: z.string().trim().regex(/^\d{2}$/u).optional(),
  trigger: wakeupTriggerSchema.default("scheduled"),
});

type RunWakeupCheckInput = z.output<typeof runWakeupCheckInputSchema>;

interface RunWakeupCheckOutput {
  instanceId: string;
  trigger: z.infer<typeof wakeupTriggerSchema>;
  status: "disabled" | "skipped" | "idle" | "notice" | "deduped";
  noticePersisted: boolean;
  nextRunAt: number | null;
  skippedReason?: string;
}

const isManagedWakeupJob = (job: JobState): boolean =>
  job.routineName === MANAGED_WAKEUP_ROUTINE_NAME || String(job.botId).startsWith("runtime:wakeup:");

const summarizeJob = (job: JobState): Record<string, unknown> => ({
  id: job.id,
  serialNumber: job.serialNumber ?? null,
  botId: job.botId,
  routineName: job.routineName,
  status: job.status,
  nextRunAt: job.nextRunAt ?? null,
  lastRunAt: job.lastRunAt ?? null,
  cyclesCompleted: job.cyclesCompleted,
  totalCycles: job.totalCycles ?? null,
  lastError: job.lastError ?? null,
  updatedAt: job.updatedAt,
});

const buildWakeupSnapshot = (stateStore: StateStore, instanceId: string): Record<string, unknown> => {
  const jobs = stateStore.listJobs().filter((job) => !isManagedWakeupJob(job));
  const relevantJobs = jobs
    .toSorted((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 12)
    .map(summarizeJob);
  const pendingJobs = jobs.filter((job) => job.status === "pending").length;
  const runningJobs = jobs.filter((job) => job.status === "running").length;
  const pausedJobs = jobs.filter((job) => job.status === "paused").length;
  const failedJobs = jobs.filter((job) => job.status === "failed").length;
  const stoppedJobs = jobs.filter((job) => job.status === "stopped").length;
  return {
    instanceId,
    generatedAt: new Date().toISOString(),
    jobCounts: {
      pending: pendingJobs,
      running: runningJobs,
      paused: pausedJobs,
      failed: failedJobs,
      stopped: stoppedJobs,
    },
    recentJobs: relevantJobs,
  };
};

const buildWakeupSystemPrompt = (): string =>
  [
    "You are TrenchClaw's wakeup monitor.",
    "Wakeups can be triggered by a schedule, by boot-time recovery, or by a manual operator request.",
    "This is an internal monitoring pass, not implied permission to trade, mutate state, or invent a user request.",
    "Stay strictly scoped to the active instance. Do not infer, summarize, or reference other instances.",
    "Follow the operator instruction exactly and stay strictly grounded in the runtime snapshot.",
    "Surface only concrete changes, failures, risks, or follow-up items that matter to the operator. Ignore routine noise.",
    "If there is nothing worth surfacing, return exactly NO_NOTICE.",
    "If there is something worth surfacing, return one concise plain-text operator notice with no markdown bullets or code fences.",
  ].join("\n");

const buildWakeupPrompt = (input: {
  trigger: z.infer<typeof wakeupTriggerSchema>;
  operatorInstruction: string;
  snapshot: Record<string, unknown>;
}): string =>
  [
    `Wakeup trigger: ${input.trigger}`,
    "",
    "Operator instruction:",
    input.operatorInstruction,
    "",
    "Runtime snapshot:",
    JSON.stringify(input.snapshot, null, 2),
    "",
    "Return either NO_NOTICE or one concise operator notice.",
  ].join("\n");

const normalizeWakeupNotice = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^NO_NOTICE$/iu.test(trimmed)) {
    return null;
  }

  return trimmed
    .replace(/^["'`]+/u, "")
    .replace(/["'`]+$/u, "")
    .trim() || null;
};

export const runWakeupCheckAction: Action<RunWakeupCheckInput, RunWakeupCheckOutput> = {
  name: "runWakeupCheck",
  category: "data-based",
  subcategory: "read-only",
  inputSchema: runWakeupCheckInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();
    const instanceId = input.instanceId ?? resolveCurrentActiveInstanceIdSync();
    const stateStore = ctx.stateStore;

    if (!instanceId) {
      return {
        ok: false,
        retryable: false,
        error: "No active instance selected. Wakeup checks are instance-scoped.",
        code: "WAKEUP_INSTANCE_UNAVAILABLE",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }

    if (!stateStore) {
      return {
        ok: false,
        retryable: false,
        error: "stateStore is not available in action context",
        code: "STATE_STORE_UNAVAILABLE",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }

    let status: RunWakeupCheckOutput["status"] = "idle";
    let noticePersisted = false;
    let skippedReason: string | undefined;

    try {
      const schedule = await loadManagedWakeupSchedule(instanceId);
      if (!schedule.enabled) {
        status = "disabled";
      } else if (!ctx.llm) {
        status = "skipped";
        skippedReason = "llm_unavailable";
      } else {
        const snapshot = buildWakeupSnapshot(stateStore, instanceId);
        const result = await ctx.llm.generate({
          system: buildWakeupSystemPrompt(),
          prompt: buildWakeupPrompt({
            trigger: input.trigger,
            operatorInstruction: schedule.settings.prompt,
            snapshot,
          }),
          mode: "runtime-wakeup",
          maxOutputTokens: 512,
        });
        const notice = normalizeWakeupNotice(result.text);
        if (notice) {
          noticePersisted = persistRuntimeNotice({
            stateStore,
            instanceId,
            content: notice,
            kind: "wakeup-notice",
            title: "Wakeup notices",
            dedupe: true,
          });
          status = noticePersisted ? "notice" : "deduped";
        }
      }

      const syncResult = await syncManagedWakeupJob({
        stateStore,
        instanceId,
      });

      return {
        ok: true,
        retryable: false,
        data: {
          instanceId,
          trigger: input.trigger,
          status,
          noticePersisted,
          nextRunAt: syncResult.nextRunAt,
          skippedReason,
        },
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    } catch (error) {
      let nextRunAt: number | null = null;
      try {
        nextRunAt = (await syncManagedWakeupJob({
          stateStore,
          instanceId,
        })).nextRunAt;
      } catch {
        nextRunAt = null;
      }

      return {
        ok: false,
        retryable: false,
        error: error instanceof Error ? error.message : String(error),
        code: "WAKEUP_CHECK_FAILED",
        data: {
          instanceId,
          trigger: input.trigger,
          status: "skipped",
          noticePersisted,
          nextRunAt,
        } satisfies RunWakeupCheckOutput,
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
