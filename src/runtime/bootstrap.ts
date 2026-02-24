import {
  ActionDispatcher,
  ActionRegistry,
  createActionContext,
  InMemoryRuntimeEventBus,
  InMemoryStateStore,
  PolicyEngine,
  Scheduler,
  type Action,
  type Policy,
  type JobState,
  type RuntimeEventBus,
} from "../ai";
import type { RoutinePlanner } from "../ai/contracts/scheduler";
import { createJupiterUltraAdapterFromEnv } from "../solana/adapters/jupiter-ultra";
import { createTokenAccountAdapterFromEnv } from "../solana/adapters/token-account";
import { createUltraSignerAdapterFromEnv } from "../solana/adapters/ultra-signer";
import { actionSequenceRoutine } from "../solana/routines/action-sequence";
import { createWalletsRoutine } from "../solana/routines/create-wallets";
import { createWalletsAction } from "../solana/actions/wallet-based/create-wallets/createWallets";
import { ultraExecuteSwapAction } from "../solana/actions/wallet-based/swap/ultra/executeSwap";
import { ultraQuoteSwapAction } from "../solana/actions/wallet-based/swap/ultra/quoteSwap";
import { ultraSwapAction } from "../solana/actions/wallet-based/swap/ultra/swap";
import {
  loadRuntimeSettings,
  resolveRuntimeSettingsProfile,
  type RuntimeSettings,
} from "./config";

type RuntimeAction = Action<any, any>;

const INFO_LEVELS = new Set(["debug", "info"]);

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
    return settings.actions.walletBased.createWallets && settings.wallet.dangerously.allowCreatingWallets;
  }

  if (actionName === "ultraQuoteSwap") {
    return settings.actions.walletBased.ultraQuoteSwap && settings.trading.jupiter.ultra.allowQuotes;
  }

  if (actionName === "ultraExecuteSwap") {
    return settings.actions.walletBased.ultraExecuteSwap && settings.trading.jupiter.ultra.allowExecutions;
  }

  if (actionName === "ultraSwap") {
    return (
      settings.actions.walletBased.ultraSwap &&
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

    return { allowed: true, policyName: "runtime-settings-guard" };
  },
});

const buildActionCatalog = (settings: RuntimeSettings): RuntimeAction[] => {
  const actions: RuntimeAction[] = [createWalletsAction];

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

const attachEventLogging = (settings: RuntimeSettings, eventBus: RuntimeEventBus): void => {
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
  stateStore: InMemoryStateStore;
  scheduler: Scheduler;
  dispatcher: ActionDispatcher;
  registry: ActionRegistry;
  stop: () => void;
  enqueueJob: (input: { botId: string; routineName: string; config?: Record<string, unknown> }) => JobState;
  describe: () => {
    profile: RuntimeSettings["profile"];
    registeredActions: string[];
    pendingJobs: number;
    schedulerTickMs: number;
  };
}

export const bootstrapRuntime = async (): Promise<RuntimeBootstrap> => {
  const profile = resolveRuntimeSettingsProfile();
  const settings = await loadRuntimeSettings(profile);
  const eventBus = new InMemoryRuntimeEventBus();
  const stateStore = new InMemoryStateStore();
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

  attachEventLogging(settings, eventBus);
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
    scheduler,
    dispatcher,
    registry,
    stop: () => scheduler.stop(),
    enqueueJob,
    describe: () => ({
      profile: settings.profile,
      registeredActions: registry.list().map((action) => action.name),
      pendingJobs: stateStore.listJobs({ status: "pending" }).length,
      schedulerTickMs: settings.runtime.scheduler.tickMs,
    }),
  };
};
