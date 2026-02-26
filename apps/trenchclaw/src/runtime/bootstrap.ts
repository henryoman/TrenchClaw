import path from "node:path";

import {
  ActionDispatcher,
  ActionRegistry,
  createLlmClientFromEnv,
  createActionContext,
  InMemoryRuntimeEventBus,
  InMemoryStateStore,
  PolicyEngine,
  Scheduler,
  type Action,
  type Policy,
  type JobState,
  type RuntimeEventBus,
  type RuntimeEventName,
  type RuntimeEventMap,
  type StateStore,
  type LlmClient,
  type LlmGenerateInput,
  type LlmGenerateResult,
} from "../ai";
import type { RoutinePlanner } from "../ai/runtime/types/scheduler";
import { createJupiterUltraAdapterFromEnv } from "../solana/lib/adapters/jupiter-ultra";
import { createTokenAccountAdapterFromEnv } from "../solana/lib/adapters/token-account";
import { createUltraSignerAdapterFromEnv } from "../solana/lib/adapters/ultra-signer";
import { actionSequenceRoutine } from "../solana/routines/action-sequence";
import { createWalletsRoutine } from "../solana/routines/create-wallets";
import { createWalletsAction } from "../solana/actions/wallet-based/create-wallets/createWallets";
import { renameWalletsAction } from "../solana/actions/wallet-based/create-wallets/renameWallets";
import { createBlockchainAlertAction } from "../solana/actions/data-fetch/alerts/createBlockchainAlert";
import { queryRuntimeStoreAction } from "../solana/actions/data-fetch/runtime/queryRuntimeStore";
import { pingRuntimeAction } from "../solana/actions/data-fetch/runtime/pingRuntime";
import { transferAction } from "../solana/actions/wallet-based/transfer/transfer";
import {
  privacyAirdropAction,
  privacySwapAction,
  privacyTransferAction,
} from "../solana/actions/wallet-based/transfer/privacyCash";
import { ultraExecuteSwapAction } from "../solana/actions/wallet-based/swap/ultra/executeSwap";
import { ultraQuoteSwapAction } from "../solana/actions/wallet-based/swap/ultra/quoteSwap";
import { ultraSwapAction } from "../solana/actions/wallet-based/swap/ultra/swap";
import {
  loadRuntimeSettings,
  resolveRuntimeSettingsProfile,
  type RuntimeSettings,
} from "./load";
import { createRuntimeLogger, type RuntimeLogger } from "./logging";
import {
  MemoryLogStore,
  RuntimeFileEventLog,
  SessionLogStore,
  SessionSummaryStore,
  SummaryLogStore,
  SqliteStateStore,
  SystemLogStore,
  type ActiveSessionInfo,
} from "./storage";
import { createRuntimeChatService, type RuntimeChatService } from "./chat";

type RuntimeAction = Action<any, any>;
const DANGEROUS_ACTIONS_REQUIRING_CONFIRMATION = new Set([
  "executeSwap",
  "ultraExecuteSwap",
  "ultraSwap",
  "transfer",
  "privacyTransfer",
  "privacyAirdrop",
  "privacySwap",
  "createToken",
]);
const TRADE_ACTIONS = new Set(["executeSwap", "ultraExecuteSwap", "ultraSwap", "privacySwap"]);
const DATA_ACTION_NAME_PATTERNS = [/^query/i, /^fetch/i, /^download/i, /^scan/i, /^list/i];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const trimOrUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const envFlagEnabled = (name: string, fallback: boolean): boolean => {
  const configured = trimOrUndefined(process.env[name]);
  if (!configured) {
    return fallback;
  }
  return configured === "1" || configured.toLowerCase() === "true";
};

const runBootstrapScript = async (logger: RuntimeLogger, relativeScriptPath: string): Promise<void> => {
  const proc = Bun.spawn([process.execPath, "run", relativeScriptPath], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  if (exitCode !== 0) {
    logger.warn("context:refresh_failed", {
      script: relativeScriptPath,
      exitCode,
      stderr: stderr.trim(),
    });
    return;
  }

  const output = stdout.trim();
  if (output) {
    logger.info("context:refresh", {
      script: relativeScriptPath,
      output,
    });
  }
};

const runBootContextRefresh = async (logger: RuntimeLogger): Promise<void> => {
  if (!envFlagEnabled("TRENCHCLAW_BOOT_REFRESH_CONTEXT", false)) {
    return;
  }

  await runBootstrapScript(logger, "src/lib/agent-scripts/refresh-workspace-context.ts");

  if (envFlagEnabled("TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE", true)) {
    await runBootstrapScript(logger, "src/lib/agent-scripts/refresh-knowledge-manifest.ts");
  }
};

const toSupportedActionMap = (actions: RuntimeAction[]): Map<string, RuntimeAction> => {
  const map = new Map<string, RuntimeAction>();
  for (const action of actions) {
    map.set(action.name, action);
  }
  return map;
};

const resolveRoutinePlanner = (routineName: string): RoutinePlanner => {
  if (routineName === "createWallets") {
    return createWalletsRoutine;
  }
  if (routineName === "actionSequence") {
    return actionSequenceRoutine;
  }

  throw new Error(
    `Unsupported routine "${routineName}". Supported routines: "createWallets", "actionSequence".`,
  );
};

const actionEnabledBySettings = (settings: RuntimeSettings, actionName: string): boolean => {
  if (actionName === "createWallets") {
    return settings.wallet.dangerously.allowCreatingWallets;
  }

  if (actionName === "renameWallets") {
    return settings.wallet.dangerously.allowUpdatingWallets;
  }

  if (actionName === "ultraQuoteSwap") {
    return settings.trading.enabled && settings.trading.jupiter.ultra.enabled && settings.trading.jupiter.ultra.allowQuotes;
  }

  if (actionName === "ultraExecuteSwap") {
    return (
      settings.trading.enabled &&
      settings.trading.jupiter.ultra.enabled &&
      settings.trading.jupiter.ultra.allowExecutions
    );
  }

  if (actionName === "ultraSwap") {
    return (
      settings.trading.enabled &&
      settings.trading.jupiter.ultra.enabled &&
      settings.trading.jupiter.ultra.allowQuotes &&
      settings.trading.jupiter.ultra.allowExecutions
    );
  }

  if (actionName === "createBlockchainAlert") {
    return settings.trading.enabled;
  }

  if (actionName === "queryRuntimeStore") {
    return true;
  }

  if (actionName === "pingRuntime") {
    return true;
  }

  if (actionName === "transfer") {
    return (
      settings.trading.enabled &&
      settings.wallet.dangerously.allowWalletSigning &&
      settings.trading.limits.maxSingleTransferSol > 0
    );
  }

  if (actionName === "privacyTransfer" || actionName === "privacyAirdrop") {
    return (
      settings.trading.enabled &&
      settings.wallet.dangerously.allowWalletSigning &&
      settings.trading.limits.maxSingleTransferSol > 0
    );
  }

  if (actionName === "privacySwap") {
    return (
      settings.trading.enabled &&
      settings.wallet.dangerously.allowWalletSigning &&
      settings.trading.limits.maxSingleTransferSol > 0 &&
      settings.trading.jupiter.ultra.enabled &&
      settings.trading.jupiter.ultra.allowQuotes &&
      settings.trading.jupiter.ultra.allowExecutions
    );
  }

  return false;
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

    if (!actionEnabledBySettings(settings, actionName)) {
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
  const sqliteDir = path.isAbsolute(sqlitePath) ? path.dirname(sqlitePath) : path.join(process.cwd(), path.dirname(sqlitePath));
  return path.basename(sqliteDir) === "runtime" ? path.dirname(sqliteDir) : sqliteDir;
};

const comparePendingJobs = (a: JobState, b: JobState): number => {
  const nextRunA = typeof a.nextRunAt === "number" ? a.nextRunAt : Number.MAX_SAFE_INTEGER;
  const nextRunB = typeof b.nextRunAt === "number" ? b.nextRunAt : Number.MAX_SAFE_INTEGER;
  if (nextRunA !== nextRunB) {
    return nextRunA - nextRunB;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  return a.id.localeCompare(b.id);
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

export const buildActionCatalog = (settings: RuntimeSettings): RuntimeAction[] => {
  const actions: RuntimeAction[] = [createWalletsAction, renameWalletsAction, queryRuntimeStoreAction, pingRuntimeAction];

  if (settings.trading.enabled) {
    actions.push(createBlockchainAlertAction);
  }

  if (
    settings.trading.enabled &&
    settings.wallet.dangerously.allowWalletSigning &&
    settings.trading.limits.maxSingleTransferSol > 0
  ) {
    actions.push(transferAction);
    actions.push(privacyTransferAction, privacyAirdropAction);
  }

  if (settings.trading.enabled && settings.trading.jupiter.ultra.enabled) {
    actions.push(ultraQuoteSwapAction, ultraExecuteSwapAction, ultraSwapAction);
    if (
      settings.wallet.dangerously.allowWalletSigning &&
      settings.trading.limits.maxSingleTransferSol > 0 &&
      settings.trading.jupiter.ultra.allowQuotes &&
      settings.trading.jupiter.ultra.allowExecutions
    ) {
      actions.push(privacySwapAction);
    }
  }

  return actions;
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
  fileEventLog?: RuntimeFileEventLog,
  sessionLogStore?: SessionLogStore,
  memoryLogStore?: MemoryLogStore,
  summaryLogStore?: SummaryLogStore,
): void => {
  if (fileEventLog) {
    for (const eventName of EVENT_NAMES) {
      eventBus.on<typeof eventName>(eventName, (event) => {
        fileEventLog.write(event.type, event.payload as RuntimeEventMap[typeof eventName], event.timestamp);
      });
    }
  }
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
  stop: () => void;
  enqueueJob: (input: { botId: string; routineName: string; config?: Record<string, unknown> }) => JobState;
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
    logger.info("storage:schema_snapshot", { snapshot: sqliteStore.getSchemaSnapshot() });
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

  const jupiterUltra = createJupiterUltraAdapterFromEnv();
  const tokenAccounts = createTokenAccountAdapterFromEnv();
  const ultraSigner = await createUltraSignerAdapterFromEnv();

  const scheduler = new Scheduler(
    {
      stateStore,
      dispatcher,
      eventBus,
      createContext: (job) =>
        createActionContext({
          actor: "agent",
          eventBus,
          jobMeta: {
            jobId: job.id,
            botId: job.botId,
            cycle: job.cyclesCompleted + 1,
          },
          jupiterUltra,
          tokenAccounts,
          ultraSigner,
          stateStore,
        }),
      resolveRoutine: (routineName) => resolveRoutinePlanner(routineName),
    },
    settings.runtime.scheduler.tickMs,
  );

  const fileEventLog = settings.storage.files.enabled
    ? new RuntimeFileEventLog({ directory: settings.storage.files.eventsDirectory })
    : undefined;
  const sessionLogStore = settings.storage.sessions.enabled
    ? new SessionLogStore({
        directory: settings.storage.sessions.directory,
        agentId: process.env.TRENCHCLAW_AGENT_ID?.trim() || settings.storage.sessions.agentId,
        sessionKey:
          process.env.TRENCHCLAW_SESSION_KEY?.trim() ||
          `agent:${process.env.TRENCHCLAW_AGENT_ID?.trim() || settings.storage.sessions.agentId}:main`,
        source: process.env.TRENCHCLAW_SESSION_SOURCE?.trim() || settings.storage.sessions.source,
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

  attachEventLogging(settings, logger, eventBus, fileEventLog, sessionLogStore, memoryLogStore, summaryLogStore);
  scheduler.start();

  const enqueueJob = (input: {
    botId: string;
    routineName: string;
    config?: Record<string, unknown>;
  }): JobState => {
    const now = Date.now();
    const job: JobState = {
      id: crypto.randomUUID(),
      botId: input.botId,
      routineName: input.routineName,
      status: "pending",
      config: input.config ?? {},
      cyclesCompleted: 0,
      createdAt: now,
      updatedAt: now,
      nextRunAt: now,
    };
    stateStore.saveJob(job);
    const pendingJobs = stateStore.listJobs({ status: "pending" }).toSorted(comparePendingJobs);
    const queuePosition = pendingJobs.findIndex((entry) => entry.id === job.id) + 1;
    eventBus.emit("queue:enqueue", {
      jobId: job.id,
      botId: job.botId,
      routineName: job.routineName,
      queueSize: pendingJobs.length,
      queuePosition: queuePosition > 0 ? queuePosition : pendingJobs.length,
      nextRunAt: job.nextRunAt,
    });
    return job;
  };

  // Optional boot hook for validating the runtime path immediately.
  if ((process.env.TRENCHCLAW_BOOTSTRAP_CREATE_WALLETS ?? "").trim() === "1") {
    enqueueJob({
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
      llm,
      workspaceToolsEnabled: settings.agent.dangerously.allowFilesystemWrites,
    }),
    session,
    stop: () => {
      scheduler.stop();
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
    },
    enqueueJob,
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
