import path from "node:path";

import type { Action } from "../ai/runtime/types/action";
import {
  ActionDispatcher,
  ActionRegistry,
  createLlmClientFromEnv,
  createActionContext,
  type CreateActionContextConfig,
  InMemoryRuntimeEventBus,
  InMemoryStateStore,
  PolicyEngine,
  Scheduler,
  type Policy,
  type JobState,
  type RuntimeEventBus,
  type RuntimeEventName,
  type StateStore,
  type LlmClient,
  type LlmGenerateInput,
  type LlmGenerateResult,
} from "../ai";
import { createJupiterTriggerAdapterFromConfig } from "../solana/lib/adapters/jupiter-trigger";
import { createJupiterUltraAdapterFromConfig } from "../solana/lib/adapters/jupiter-ultra";
import { createTokenAccountAdapter } from "../solana/lib/adapters/token-account";
import { createUltraSignerAdapterFromVault } from "../solana/lib/adapters/ultra-signer";
import { loadRoutinePlanner } from "../solana/routines/load";
import {
  workspaceToolsEnabledByRuntimeSettings,
  getRuntimeActionCatalog,
  getRuntimeActionsRequiringUserConfirmation,
  isRuntimeActionEnabledBySettings,
} from "./capabilities";
import { getRuntimeCapabilitySnapshot, type RuntimeCapabilitySnapshot } from "./capabilities";
import {
  loadRuntimeSettings,
  resolveRuntimeSettingsProfile,
  type RuntimeSettings,
} from "./load";
import { createRuntimeLogger, type RuntimeLogger } from "./logging/runtime-logger";
import { refreshWorkspaceContext } from "../lib/agent-scripts/refresh-workspace-context";
import { refreshKnowledgeManifest } from "../lib/agent-scripts/refresh-knowledge-manifest";
import {
  MemoryLogStore,
  SessionLogStore,
  SessionSummaryStore,
  SummaryLogStore,
  SqliteStateStore,
  SystemLogStore,
  setLogIoWriteObserver,
  type ActiveSessionInfo,
} from "./storage";
import { createRuntimeChatService, type RuntimeChatService } from "./chat";
import { CORE_APP_ROOT, RUNTIME_GENERATED_ROOT } from "./runtime-paths";

const DANGEROUS_ACTIONS_REQUIRING_CONFIRMATION = getRuntimeActionsRequiringUserConfirmation();
const TRADE_ACTIONS = new Set(["executeSwap", "ultraExecuteSwap", "ultraSwap", "managedUltraSwap", "privacySwap"]);
const DATA_ACTION_NAME_PATTERNS = [/^query/i, /^fetch/i, /^download/i, /^scan/i, /^list/i];
const GENERATED_WORKSPACE_CONTEXT_PATH = path.join(RUNTIME_GENERATED_ROOT, "workspace-context.md");
const GENERATED_KNOWLEDGE_MANIFEST_PATH = path.join(RUNTIME_GENERATED_ROOT, "knowledge-manifest.md");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const trimOrUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const getPrimaryRpcUrlFromSettings = (settings: RuntimeSettings): string | undefined => {
  const preferredEndpoint = settings.network.rpc.endpoints.find((endpoint) => endpoint.enabled);
  const fallbackEndpoint = settings.network.rpc.endpoints[0];
  return trimOrUndefined((preferredEndpoint ?? fallbackEndpoint)?.url);
};

const envFlagEnabled = (name: string, fallback: boolean): boolean => {
  const configured = trimOrUndefined(process.env[name]);
  if (!configured) {
    return fallback;
  }
  return configured === "1" || configured.toLowerCase() === "true";
};

const runBootstrapTask = async (
  logger: RuntimeLogger,
  label: string,
  task: () => Promise<string[]>,
): Promise<void> => {
  try {
    const output = (await task()).join("\n").trim();
    if (output) {
      logger.info("context:refresh", {
        script: label,
        output,
      });
    }
  } catch (error) {
    logger.warn("context:refresh_failed", {
      script: label,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const generatedArtifactExists = async (filePath: string): Promise<boolean> => await Bun.file(filePath).exists();

const runBootContextRefresh = async (logger: RuntimeLogger): Promise<void> => {
  const refreshContext = envFlagEnabled("TRENCHCLAW_BOOT_REFRESH_CONTEXT", false);
  const refreshKnowledge = envFlagEnabled("TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE", true);
  const missingWorkspaceContext = !(await generatedArtifactExists(GENERATED_WORKSPACE_CONTEXT_PATH));
  const missingKnowledgeManifest = !(await generatedArtifactExists(GENERATED_KNOWLEDGE_MANIFEST_PATH));

  if (refreshContext || missingWorkspaceContext) {
    await runBootstrapTask(logger, "refresh-workspace-context", refreshWorkspaceContext);
  }

  if (refreshKnowledge || missingKnowledgeManifest) {
    await runBootstrapTask(logger, "refresh-knowledge-manifest", refreshKnowledgeManifest);
  }
};

const toSupportedActionMap = (actions: Action<any, any>[]): Map<string, Action<any, any>> => {
  const map = new Map<string, Action<any, any>>();
  for (const action of actions) {
    map.set(action.name, action);
  }
  return map;
};

const createSettingsPolicy = (settings: RuntimeSettings, supportedActions: ReadonlySet<string>): Policy => ({
  name: "runtime-settings-guard",
  type: "pre" as const,
  evaluate: async (_ctx: unknown, payload?: unknown) => {
    const actionName =
      payload && typeof payload === "object" && "actionName" in payload
        ? String((payload as { actionName?: unknown }).actionName ?? "")
        : "";

    if (!actionName || !supportedActions.has(actionName)) {
      return { allowed: false, policyName: "runtime-settings-guard", reason: `Unknown action "${actionName}"` };
    }

    if (!isRuntimeActionEnabledBySettings(settings, actionName)) {
      return {
        allowed: false,
        policyName: "runtime-settings-guard",
        reason: `Action "${actionName}" is disabled by runtime settings`,
      };
    }

    if (
      settings.trading.confirmations.requireUserConfirmationForDangerousActions &&
      DANGEROUS_ACTIONS_REQUIRING_CONFIRMATION.has(actionName) &&
      !hasUserConfirmation(payload, settings.trading.confirmations.userConfirmationToken)
    ) {
      return {
        allowed: false,
        policyName: "runtime-settings-guard",
        reason: `Action "${actionName}" requires explicit user confirmation in dangerous mode`,
      };
    }

    return { allowed: true, policyName: "runtime-settings-guard" };
  },
});

const hasUserConfirmation = (payload: unknown, requiredToken: string): boolean => {
  if (!isRecord(payload)) {
    return false;
  }

  const input = payload.input;
  if (!isRecord(input)) {
    return false;
  }

  if (input.confirmedByUser === true) {
    return true;
  }

  if (typeof input.userConfirmationToken === "string" && input.userConfirmationToken === requiredToken) {
    return true;
  }

  const userConfirmation = input.userConfirmation;
  if (!isRecord(userConfirmation)) {
    return false;
  }

  return (
    userConfirmation.confirmed === true ||
    (typeof userConfirmation.token === "string" && userConfirmation.token === requiredToken)
  );
};

const resolveStorageRootDirectory = (settings: RuntimeSettings): string => {
  const sqlitePath = settings.storage.sqlite.path;
  const sqliteDir = path.isAbsolute(sqlitePath)
    ? path.dirname(sqlitePath)
    : path.join(CORE_APP_ROOT, path.dirname(sqlitePath));
  return path.basename(sqliteDir) === "runtime" ? path.dirname(sqliteDir) : sqliteDir;
};

const normalizeExecuteAtUnixMs = (value: number | undefined, now: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return now;
  }

  const normalized = Math.max(0, Math.trunc(value));
  return normalized > now ? normalized : now;
};

const isTradeActionName = (actionName: string): boolean => TRADE_ACTIONS.has(actionName);

const isDataActionName = (actionName: string): boolean =>
  !isTradeActionName(actionName) && DATA_ACTION_NAME_PATTERNS.some((pattern) => pattern.test(actionName));

const instrumentLlmClient = (
  llm: LlmClient,
  logger: RuntimeLogger,
): LlmClient => {
  const generate = async (input: LlmGenerateInput): Promise<LlmGenerateResult> => {
    const startedAt = Date.now();
    try {
      const result = await llm.generate(input);
      const durationMs = Date.now() - startedAt;
      logger.info("ai:call", {
        provider: llm.provider,
        model: llm.model,
        mode: input.mode ?? llm.defaultMode ?? "default",
        promptChars: input.prompt.length,
        durationMs,
        finishReason: result.finishReason,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        totalTokens: result.usage?.totalTokens ?? null,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("ai:call_fail", {
        provider: llm.provider,
        model: llm.model,
        mode: input.mode ?? llm.defaultMode ?? "default",
        promptChars: input.prompt.length,
        durationMs: Date.now() - startedAt,
        error: message,
      });
      throw error;
    }
  };

  const stream: LlmClient["stream"] = async (input) => {
    const startedAt = Date.now();
    try {
      const result = await llm.stream(input);
      logger.info("ai:stream_start", {
        provider: llm.provider,
        model: llm.model,
        mode: input.mode ?? llm.defaultMode ?? "default",
        promptChars: input.prompt.length,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("ai:stream_fail", {
        provider: llm.provider,
        model: llm.model,
        mode: input.mode ?? llm.defaultMode ?? "default",
        promptChars: input.prompt.length,
        durationMs: Date.now() - startedAt,
        error: message,
      });
      throw error;
    }
  };

  return {
    ...llm,
    generate,
    stream,
  };
};

export const buildActionCatalog = (settings: RuntimeSettings): Action<any, any>[] => {
  return getRuntimeActionCatalog(settings);
};

const EVENT_NAMES: RuntimeEventName[] = [
  "action:start",
  "action:success",
  "action:fail",
  "action:retry",
  "bot:start",
  "bot:pause",
  "bot:stop",
  "policy:block",
  "rpc:failover",
  "queue:enqueue",
  "queue:dequeue",
  "queue:complete",
];

const attachEventLogging = (
  settings: RuntimeSettings,
  logger: RuntimeLogger,
  eventBus: RuntimeEventBus,
  sessionLogStore?: SessionLogStore,
  memoryLogStore?: MemoryLogStore,
  summaryLogStore?: SummaryLogStore,
): void => {
  if (sessionLogStore) {
    for (const eventName of EVENT_NAMES) {
      eventBus.on<typeof eventName>(eventName, (event) => {
        void sessionLogStore.appendEvent(event.type, event.payload);
      });
    }
  }
  if (memoryLogStore) {
    eventBus.on("policy:block", (event) => {
      memoryLogStore.appendDaily(
        `- [${new Date(event.timestamp).toISOString()}] policy:block ${event.payload.actionName} :: ${event.payload.reason}`,
      );
    });
  }
  if (summaryLogStore) {
    eventBus.on("bot:start", (event) => {
      summaryLogStore.append({
        timestamp: new Date(event.timestamp).toISOString(),
        category: "runtime",
        event: "bot:start",
        details: {
          botId: event.payload.botId,
          routineName: event.payload.routineName,
        },
      });
    });
    eventBus.on("bot:stop", (event) => {
      summaryLogStore.append({
        timestamp: new Date(event.timestamp).toISOString(),
        category: "runtime",
        event: "bot:stop",
        details: {
          botId: event.payload.botId,
          reason: event.payload.reason ?? null,
        },
      });
    });
    eventBus.on("action:success", (event) => {
      const actionName = event.payload.actionName;
      if (isTradeActionName(actionName)) {
        summaryLogStore.append({
          timestamp: new Date(event.timestamp).toISOString(),
          category: "trade",
          event: "trade:executed",
          details: {
            actionName,
            txSignature: event.payload.txSignature ?? null,
            durationMs: event.payload.durationMs,
          },
        });
        return;
      }
      if (isDataActionName(actionName)) {
        summaryLogStore.append({
          timestamp: new Date(event.timestamp).toISOString(),
          category: "data",
          event: "data:download_complete",
          details: {
            actionName,
            durationMs: event.payload.durationMs,
          },
        });
      }
    });
  }

  const includeDecisionTrace = settings.observability.logging.includeDecisionTrace;
  eventBus.on("action:success", (event) => {
    logger.info("action:success", {
      actionName: event.payload.actionName,
      idempotencyKey: event.payload.idempotencyKey,
      ...(includeDecisionTrace
        ? { durationMs: event.payload.durationMs, txSignature: event.payload.txSignature ?? null }
        : {}),
    });
  });
  eventBus.on("action:fail", (event) => {
    logger.warn("action:fail", {
      actionName: event.payload.actionName,
      error: event.payload.error,
      ...(includeDecisionTrace
        ? {
            idempotencyKey: event.payload.idempotencyKey,
            retryable: event.payload.retryable,
            attempts: event.payload.attempts,
          }
        : {}),
    });
  });
  eventBus.on("policy:block", (event) => {
    logger.warn("policy:block", {
      actionName: event.payload.actionName,
      reason: event.payload.reason,
      ...(includeDecisionTrace ? { policyName: event.payload.policyName } : {}),
    });
  });
  eventBus.on("action:retry", (event) => {
    logger.info("action:retry", {
      actionName: event.payload.actionName,
      attempt: event.payload.attempt,
      ...(includeDecisionTrace
        ? {
            idempotencyKey: event.payload.idempotencyKey,
            nextRetryMs: event.payload.nextRetryMs,
          }
        : {}),
    });
  });
  eventBus.on("rpc:failover", (event) => {
    logger.warn("rpc:failover", {
      fromEndpoint: event.payload.fromEndpoint,
      toEndpoint: event.payload.toEndpoint,
      ...(includeDecisionTrace && event.payload.reason ? { reason: event.payload.reason } : {}),
    });
  });
  eventBus.on("queue:enqueue", (event) => {
    logger.info("queue:enqueue", {
      jobId: event.payload.jobId,
      botId: event.payload.botId,
      routineName: event.payload.routineName,
      queueSize: event.payload.queueSize,
      queuePosition: event.payload.queuePosition,
      ...(includeDecisionTrace ? { nextRunAt: event.payload.nextRunAt ?? null } : {}),
    });
  });
  eventBus.on("queue:dequeue", (event) => {
    logger.info("queue:dequeue", {
      jobId: event.payload.jobId,
      botId: event.payload.botId,
      routineName: event.payload.routineName,
      queueSize: event.payload.queueSize,
      queuePosition: event.payload.queuePosition,
      ...(includeDecisionTrace ? { waitMs: event.payload.waitMs } : {}),
    });
  });
  eventBus.on("queue:complete", (event) => {
    logger.info("queue:complete", {
      jobId: event.payload.jobId,
      botId: event.payload.botId,
      routineName: event.payload.routineName,
      status: event.payload.status,
      ...(includeDecisionTrace
        ? {
            durationMs: event.payload.durationMs,
            cyclesCompleted: event.payload.cyclesCompleted,
          }
        : {}),
    });
  });
};

export interface RuntimeBootstrap {
  settings: RuntimeSettings;
  eventBus: InMemoryRuntimeEventBus;
  stateStore: StateStore;
  llm: LlmClient | null;
  scheduler: Scheduler;
  dispatcher: ActionDispatcher;
  registry: ActionRegistry;
  chat: RuntimeChatService;
  session: ActiveSessionInfo | null;
  stop: () => Promise<void>;
  enqueueJob: (input: {
    botId: string;
    routineName: string;
    config?: Record<string, unknown>;
    totalCycles?: number;
    executeAtUnixMs?: number;
  }) => Promise<JobState>;
  manageJob: (input: {
    jobId: string;
    operation: "pause" | "cancel" | "resume";
  }) => Promise<JobState>;
  createActionContext: (overrides?: CreateActionContextConfig) => ReturnType<typeof createActionContext>;
  describe: () => {
    profile: RuntimeSettings["profile"];
    registeredActions: string[];
    pendingJobs: number;
    schedulerTickMs: number;
    llmEnabled: boolean;
    llmModel?: string;
    sessionId?: string;
    sessionKey?: string;
  };
}

export const bootstrapRuntime = async (): Promise<RuntimeBootstrap> => {
  const profile = resolveRuntimeSettingsProfile();
  const settings = await loadRuntimeSettings(profile);
  const logger = createRuntimeLogger(settings);
  const runtimeRpcUrl = getPrimaryRpcUrlFromSettings(settings);
  setLogIoWriteObserver((event) => {
    const details: Record<string, unknown> = {
      operation: event.operation,
      filePath: event.filePath,
      bytes: event.bytes,
    };
    if (!event.ok) {
      details.error = event.error ?? "unknown write failure";
      logger.warn("storage:fs_write_fail", details);
      return;
    }
    logger.debug("storage:fs_write", details);
  });
  await runBootContextRefresh(logger);
  const eventBus = new InMemoryRuntimeEventBus();
  const sqliteStore = settings.storage.sqlite.enabled
    ? new SqliteStateStore({
        path: settings.storage.sqlite.path,
        walMode: settings.storage.sqlite.walMode,
        busyTimeoutMs: settings.storage.sqlite.busyTimeoutMs,
      })
    : null;
  const stateStore: StateStore = sqliteStore ?? new InMemoryStateStore();
  const storageRootDirectory = resolveStorageRootDirectory(settings);
  const systemLogStore = new SystemLogStore({
    directory: path.join(storageRootDirectory, "system"),
  });
  const unsubscribeSystemLogs = logger.subscribe((entry) => {
    systemLogStore.append(entry);
  });
  const sessionSummaryStore = new SessionSummaryStore({
    directory: path.join(storageRootDirectory, "summaries"),
  });
  const summaryLogStore = new SummaryLogStore({
    directory: path.join(storageRootDirectory, "summary"),
  });
  summaryLogStore.append({
    timestamp: new Date().toISOString(),
    category: "runtime",
    event: "runtime:start",
    details: {
      profile: settings.profile,
      schedulerTickMs: settings.runtime.scheduler.tickMs,
    },
  });
  if (sqliteStore) {
    const recoveredJobs = sqliteStore.recoverInterruptedJobs();
    if (recoveredJobs > 0) {
      logger.warn("storage:queue_recovery", {
        recoveredJobs,
      });
    }
    const syncReport = sqliteStore.getSchemaSyncReport();
    logger.info("storage:schema_sync", {
      createdTables: syncReport.createdTables.length,
      addedColumns: syncReport.addedColumns.length,
      createdIndexes: syncReport.createdIndexes.length,
      warnings: syncReport.warnings.length,
    });
    if (syncReport.warnings.length > 0) {
      logger.warn("storage:schema_sync_warnings", {
        warnings: syncReport.warnings.join(" | "),
      });
    }
    logger.debug("storage:schema_snapshot", { snapshot: sqliteStore.getSchemaSnapshot() });
  }
  if (settings.storage.sqlite.enabled && "pruneRuntimeData" in stateStore) {
    const pruneResult = (
      stateStore as StateStore & {
        pruneRuntimeData: (input: {
          receiptsDays: number;
        }) => {
          receiptsDeleted: number;
          cacheDeleted: number;
        };
      }
    ).pruneRuntimeData({
      receiptsDays: settings.storage.retention.receiptsDays,
    });
    logger.info("storage:prune", {
      receipts: pruneResult.receiptsDeleted,
      cache: pruneResult.cacheDeleted,
    });
  }
  const capabilitySnapshot: RuntimeCapabilitySnapshot = getRuntimeCapabilitySnapshot(settings);
  const baseLlm = await createLlmClientFromEnv();
  const llm = baseLlm ? instrumentLlmClient(baseLlm, logger) : null;
  const registry = new ActionRegistry();
  const actions = buildActionCatalog(settings);
  const supportedActionMap = toSupportedActionMap(actions);
  const settingsPolicy = createSettingsPolicy(settings, new Set(supportedActionMap.keys()));
  const policyEngine = new PolicyEngine([settingsPolicy]);
  const dispatcher = new ActionDispatcher({
    registry,
    policyEngine,
    stateStore,
    eventBus,
  });

  for (const action of actions) {
    registry.register(action);
  }

  const jupiterUltra = await createJupiterUltraAdapterFromConfig();
  const jupiterTrigger = await createJupiterTriggerAdapterFromConfig();
  const tokenAccounts = createTokenAccountAdapter({ rpcUrl: runtimeRpcUrl });
  const ultraSigner = await createUltraSignerAdapterFromVault({ rpcUrl: runtimeRpcUrl });
  let scheduler: Scheduler;
  const createRuntimeActionContext = (overrides: CreateActionContextConfig = {}) =>
    createActionContext({
      actor: overrides.actor ?? "agent",
      eventBus,
      rpcUrl: runtimeRpcUrl,
      jupiterUltra,
      jupiterTrigger,
      tokenAccounts,
      ultraSigner,
      stateStore,
      enqueueJob,
      manageJob,
      ...overrides,
    });

  const enqueueJob = async (input: {
    botId: string;
    routineName: string;
    config?: Record<string, unknown>;
    totalCycles?: number;
    executeAtUnixMs?: number;
  }): Promise<JobState> => {
    const now = Date.now();
    const executeAtUnixMs = normalizeExecuteAtUnixMs(input.executeAtUnixMs, now);
    const job: JobState = {
      id: crypto.randomUUID(),
      serialNumber: stateStore.reserveJobSerialNumber(),
      botId: input.botId,
      routineName: input.routineName,
      status: "pending",
      config: input.config ?? {},
      cyclesCompleted: 0,
      totalCycles: input.totalCycles,
      createdAt: now,
      updatedAt: now,
      nextRunAt: executeAtUnixMs,
    };
    stateStore.saveJob(job);
    if (executeAtUnixMs <= now) {
      try {
        await scheduler.enqueue(job, now);
      } catch (error) {
        stateStore.updateJobStatus(job.id, "failed", {
          lastError: error instanceof Error ? error.message : String(error),
          lastRunAt: Date.now(),
          nextRunAt: undefined,
        });
        throw error;
      }
    }
    return job;
  };

  const manageJob = async (input: {
    jobId: string;
    operation: "pause" | "cancel" | "resume";
  }): Promise<JobState> => {
    const job = stateStore.getJob(input.jobId);
    if (!job) {
      throw new Error(`Job "${input.jobId}" was not found`);
    }

    if (input.operation === "pause") {
      if (job.status !== "pending") {
        throw new Error(`Job "${input.jobId}" cannot be paused from status "${job.status}"`);
      }
      stateStore.updateJobStatus(job.id, "paused", {
        nextRunAt: job.nextRunAt,
      });
      eventBus.emit("bot:pause", {
        botId: job.botId,
        reason: "queue:pause",
      });
    } else if (input.operation === "resume") {
      if (job.status !== "paused") {
        throw new Error(`Job "${input.jobId}" cannot be resumed from status "${job.status}"`);
      }
      const nextRunAt = normalizeExecuteAtUnixMs(job.nextRunAt, Date.now());
      stateStore.updateJobStatus(job.id, "pending", {
        nextRunAt,
        lastError: undefined,
      });
      const resumedJob = stateStore.getJob(job.id);
      if (!resumedJob) {
        throw new Error(`Job "${job.id}" disappeared after resume`);
      }
      if (nextRunAt <= Date.now()) {
        try {
          await scheduler.enqueue(resumedJob);
        } catch (error) {
          stateStore.updateJobStatus(job.id, "failed", {
            lastError: error instanceof Error ? error.message : String(error),
            lastRunAt: Date.now(),
            nextRunAt: undefined,
          });
          throw error;
        }
      }
    } else {
      if (job.status === "running") {
        throw new Error(`Job "${input.jobId}" is already running and cannot be cancelled safely`);
      }
      if (job.status === "stopped" || job.status === "failed") {
        throw new Error(`Job "${input.jobId}" cannot be cancelled from status "${job.status}"`);
      }
      stateStore.updateJobStatus(job.id, "stopped", {
        nextRunAt: undefined,
      });
      eventBus.emit("bot:stop", {
        botId: job.botId,
        reason: "queue:cancel",
      });
    }

    const updatedJob = stateStore.getJob(job.id);
    if (!updatedJob) {
      throw new Error(`Job "${job.id}" disappeared after ${input.operation}`);
    }
    return updatedJob;
  };

  scheduler = new Scheduler(
    {
      stateStore,
      dispatcher,
      eventBus,
      createContext: (job) =>
        createRuntimeActionContext({
          jobMeta: {
            jobId: job.id,
            botId: job.botId,
            cycle: job.cyclesCompleted + 1,
          },
        }),
      resolveRoutine: (routineName) => loadRoutinePlanner(routineName),
    },
    settings.runtime.scheduler.tickMs,
    {
      dataPath: settings.storage.queue.path,
      maxConcurrentJobs: settings.runtime.scheduler.maxConcurrentJobs,
    },
  );

  const sessionLogStore = settings.storage.sessions.enabled
    ? new SessionLogStore({
        directory: settings.storage.sessions.directory,
        agentId: process.env.TRENCHCLAW_AGENT_ID?.trim() || settings.storage.sessions.agentId,
      sessionKey:
          process.env.TRENCHCLAW_SESSION_KEY?.trim() ||
          `agent:${process.env.TRENCHCLAW_AGENT_ID?.trim() || settings.storage.sessions.agentId}:main`,
        source: process.env.TRENCHCLAW_SESSION_SOURCE?.trim() || settings.storage.sessions.source,
        reuseSessionOnBoot: settings.storage.sessions.reuseSessionOnBoot,
      })
    : undefined;
  const session = sessionLogStore ? await sessionLogStore.open() : null;
  const memoryLogStore = settings.storage.memory.enabled
    ? new MemoryLogStore({
        directory: settings.storage.memory.directory,
        longTermFile: settings.storage.memory.longTermFile,
      })
    : undefined;
  if (sessionLogStore && session) {
    await sessionLogStore.appendMessage(
      "system",
      `Runtime booted (profile=${settings.profile}, tickMs=${settings.runtime.scheduler.tickMs})`,
    );
    if (sqliteStore) {
      await sessionLogStore.appendMessage("system", sqliteStore.getSchemaSnapshot());
    }
  }
  if (memoryLogStore) {
    memoryLogStore.appendDaily(
      `- [${new Date().toISOString()}] runtime:start profile=${settings.profile} session=${session?.sessionId ?? "none"}`,
    );
  }

  attachEventLogging(settings, logger, eventBus, sessionLogStore, memoryLogStore, summaryLogStore);
  scheduler.start();

  // Optional boot hook for validating the runtime path immediately.
  if ((process.env.TRENCHCLAW_BOOTSTRAP_CREATE_WALLETS ?? "").trim() === "1") {
    await enqueueJob({
      botId: "bootstrap",
      routineName: "createWallets",
      config: {},
    });
  }

  return {
    settings,
    eventBus,
    stateStore,
    llm,
    scheduler,
    dispatcher,
    registry,
    chat: createRuntimeChatService({
      dispatcher,
      registry,
      eventBus,
      stateStore,
      rpcUrl: runtimeRpcUrl,
      jupiterUltra,
      jupiterTrigger,
      tokenAccounts,
      ultraSigner,
      enqueueJob,
      manageJob,
      llm,
      logger,
      capabilitySnapshot,
      workspaceToolsEnabled: workspaceToolsEnabledByRuntimeSettings({ settings }),
    }),
    session,
    stop: async () => {
      await scheduler.stop();
      const pendingJobsAtStop = stateStore.listJobs({ status: "pending" }).length;
      const closableStateStore = stateStore as StateStore & { close?: () => void };
      if (sessionLogStore) {
        void sessionLogStore.appendMessage("system", "Runtime stopped");
        void (async () => {
          const stats = await sessionLogStore.getActiveSessionStats();
          if (!stats) {
            return;
          }
          await sessionSummaryStore.writeSummary({
            ...stats,
            profile: settings.profile,
            schedulerTickMs: settings.runtime.scheduler.tickMs,
            registeredActions: registry.list().map((action) => action.name),
            pendingJobsAtStop,
          });
        })();
      }
      if (memoryLogStore) {
        memoryLogStore.appendDaily(
          `- [${new Date().toISOString()}] runtime:stop session=${session?.sessionId ?? "none"}`,
        );
      }
      summaryLogStore.append({
        timestamp: new Date().toISOString(),
        category: "runtime",
        event: "runtime:stop",
        details: {
          profile: settings.profile,
          sessionId: session?.sessionId ?? null,
        },
      });
      closableStateStore.close?.();
      unsubscribeSystemLogs();
      setLogIoWriteObserver(null);
    },
    enqueueJob,
    manageJob,
    createActionContext: createRuntimeActionContext,
    describe: () => ({
      profile: settings.profile,
      registeredActions: registry.list().map((action) => action.name),
      pendingJobs: stateStore.listJobs({ status: "pending" }).length,
      schedulerTickMs: settings.runtime.scheduler.tickMs,
      llmEnabled: llm != null,
      llmModel: llm?.model,
      sessionId: session?.sessionId,
      sessionKey: session?.sessionKey,
    }),
  };
};
