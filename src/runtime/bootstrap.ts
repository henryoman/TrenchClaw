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
} from "../ai";
import type { RoutinePlanner } from "../ai/contracts/scheduler";
import { createJupiterUltraAdapterFromEnv } from "../solana/lib/adapters/jupiter-ultra";
import { createTokenAccountAdapterFromEnv } from "../solana/lib/adapters/token-account";
import { createUltraSignerAdapterFromEnv } from "../solana/lib/adapters/ultra-signer";
import { actionSequenceRoutine } from "../solana/routines/action-sequence";
import { createWalletsRoutine } from "../solana/routines/create-wallets";
import { createWalletsAction } from "../solana/actions/wallet-based/create-wallets/createWallets";
import { createBlockchainAlertAction } from "../solana/actions/data-based/alerts/createBlockchainAlert";
import { transferAction } from "../solana/actions/wallet-based/transfer/transfer";
import { ultraExecuteSwapAction } from "../solana/actions/wallet-based/swap/ultra/executeSwap";
import { ultraQuoteSwapAction } from "../solana/actions/wallet-based/swap/ultra/quoteSwap";
import { ultraSwapAction } from "../solana/actions/wallet-based/swap/ultra/swap";
import {
  loadRuntimeSettings,
  resolveRuntimeSettingsProfile,
  type RuntimeSettings,
} from "./load";
import {
  MemoryLogStore,
  RuntimeFileEventLog,
  SessionLogStore,
  SqliteStateStore,
  type ActiveSessionInfo,
} from "./storage";

type RuntimeAction = Action<any, any>;

const INFO_LEVELS = new Set(["debug", "info"]);
const DANGEROUS_ACTIONS_REQUIRING_CONFIRMATION = new Set([
  "executeSwap",
  "ultraExecuteSwap",
  "ultraSwap",
  "transfer",
  "createToken",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

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

  if (actionName === "transfer") {
    return (
      settings.trading.enabled &&
      settings.wallet.dangerously.allowWalletSigning &&
      settings.trading.limits.maxSingleTransferSol > 0
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

const buildActionCatalog = (settings: RuntimeSettings): RuntimeAction[] => {
  const actions: RuntimeAction[] = [createWalletsAction];

  if (settings.trading.enabled) {
    actions.push(createBlockchainAlertAction);
  }

  if (
    settings.trading.enabled &&
    settings.wallet.dangerously.allowWalletSigning &&
    settings.trading.limits.maxSingleTransferSol > 0
  ) {
    actions.push(transferAction);
  }

  if (settings.trading.enabled && settings.trading.jupiter.ultra.enabled) {
    actions.push(ultraQuoteSwapAction, ultraExecuteSwapAction, ultraSwapAction);
  }

  return actions;
};

const maybeLog = (settings: RuntimeSettings, ...parts: unknown[]): void => {
  if (!INFO_LEVELS.has(settings.observability.logging.level)) {
    return;
  }
  console.log(...parts);
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
];

const attachEventLogging = (
  settings: RuntimeSettings,
  eventBus: RuntimeEventBus,
  fileEventLog?: RuntimeFileEventLog,
  sessionLogStore?: SessionLogStore,
  memoryLogStore?: MemoryLogStore,
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

  if (!INFO_LEVELS.has(settings.observability.logging.level)) {
    return;
  }

  eventBus.on("action:success", (event) => {
    maybeLog(settings, "[action:success]", event.payload.actionName, event.payload.idempotencyKey);
  });
  eventBus.on("action:fail", (event) => {
    maybeLog(settings, "[action:fail]", event.payload.actionName, event.payload.error);
  });
  eventBus.on("policy:block", (event) => {
    maybeLog(settings, "[policy:block]", event.payload.actionName, event.payload.reason);
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
  const eventBus = new InMemoryRuntimeEventBus();
  const stateStore: StateStore = settings.storage.sqlite.enabled
    ? new SqliteStateStore({
        path: settings.storage.sqlite.path,
        walMode: settings.storage.sqlite.walMode,
        busyTimeoutMs: settings.storage.sqlite.busyTimeoutMs,
      })
    : new InMemoryStateStore();
  if (settings.storage.sqlite.enabled && "pruneRuntimeData" in stateStore) {
    const pruneResult = (
      stateStore as StateStore & {
        pruneRuntimeData: (input: {
          receiptsDays: number;
          policyHitsDays: number;
          decisionLogsDays: number;
        }) => {
          receiptsDeleted: number;
          policyHitsDeleted: number;
          decisionLogsDeleted: number;
          cacheDeleted: number;
        };
      }
    ).pruneRuntimeData({
      receiptsDays: settings.storage.retention.receiptsDays,
      policyHitsDays: settings.storage.retention.policyHitsDays,
      decisionLogsDays: settings.storage.retention.decisionLogsDays,
    });
    maybeLog(
      settings,
      "[storage:prune]",
      `receipts=${pruneResult.receiptsDeleted}`,
      `policyHits=${pruneResult.policyHitsDeleted}`,
      `decisionLogs=${pruneResult.decisionLogsDeleted}`,
      `cache=${pruneResult.cacheDeleted}`,
    );
  }
  const llm = await createLlmClientFromEnv();
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
  }
  if (memoryLogStore) {
    memoryLogStore.appendDaily(
      `- [${new Date().toISOString()}] runtime:start profile=${settings.profile} session=${session?.sessionId ?? "none"}`,
    );
  }

  attachEventLogging(settings, eventBus, fileEventLog, sessionLogStore, memoryLogStore);
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
    session,
    stop: () => {
      scheduler.stop();
      const closableStateStore = stateStore as StateStore & { close?: () => void };
      closableStateStore.close?.();
      if (sessionLogStore) {
        void sessionLogStore.appendMessage("system", "Runtime stopped");
      }
      if (memoryLogStore) {
        memoryLogStore.appendDaily(
          `- [${new Date().toISOString()}] runtime:stop session=${session?.sessionId ?? "none"}`,
        );
      }
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
