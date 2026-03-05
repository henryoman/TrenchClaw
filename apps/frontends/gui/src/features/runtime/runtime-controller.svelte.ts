import type {
  GuiActivityEntry,
  GuiInstanceProfileView,
  GuiPublicRpcOptionView,
  GuiQueueJobView,
  GuiSecretEntryView,
  GuiSecretOptionView,
  GuiWalletNodeView,
} from "@trenchclaw/types";
import {
  DEFAULT_NEW_INSTANCE_SAFETY_PROFILE,
  DEFAULT_CREATE_INSTANCE_ERROR,
  DEFAULT_RUNTIME_ERROR,
  GUI_API_BASE_PATH,
  DEFAULT_SIGN_IN_ERROR,
  RUNTIME_ACTIVITY_LIMIT,
  RUNTIME_STATUS_CHECKING,
  RUNTIME_STATUS_OFFLINE,
  type RuntimeSafetyProfile,
  STARTUP_GUARD_TIMEOUT_MS,
} from "../../config/app-config";
import type { GuiActivityResponse, GuiBootstrapResponse, GuiQueueResponse } from "@trenchclaw/types";
import { runtimeApi, toRuntimeUrl } from "../../runtime-api";
import {
  applyCreateInstanceSuccess,
  buildCreateInstanceRequest,
  resolvePhaseAfterBootstrap,
  resolveSignInAction,
} from "./runtime-controller.logic";

export type AppPhase = "loading" | "landing" | "login" | "app";

interface RuntimeUiState {
  phase: AppPhase;
  runtimeStatus: string;
  activeInstance: GuiInstanceProfileView | null;
  availableInstances: GuiInstanceProfileView[];
  splashError: string;
  splashBusy: boolean;
  showCreateModal: boolean;
  newInstanceName: string;
  newInstanceSafetyProfile: RuntimeSafetyProfile;
  newInstancePin: string;
  signInInstanceId: string;
  signInPin: string;
  queueJobs: GuiQueueJobView[];
  activityEntries: GuiActivityEntry[];
  vaultFilePath: string;
  vaultTemplatePath: string;
  secretsOptions: GuiSecretOptionView[];
  secretEntries: GuiSecretEntryView[];
  publicRpcOptions: GuiPublicRpcOptionView[];
  secretsBusy: boolean;
  secretsError: string;
  llmCheckBusy: boolean;
  llmCheckMessage: string;
  llmAvailable: boolean;
  walletsRootRelativePath: string;
  walletsRootExists: boolean;
  walletNodes: GuiWalletNodeView[];
  walletFileCount: number;
  walletsBusy: boolean;
  walletsError: string;
}

const formatRuntimeStatus = (profile: string, llmEnabled: boolean): string =>
  `runtime: ${profile}${llmEnabled ? " | llm on" : " | llm off"}`;

export const formatTime = (unixMs: number): string =>
  new Date(unixMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const createRuntimeController = () => {
  let eventsSource: EventSource | null = null;

  const state = $state<RuntimeUiState>({
    phase: "landing",
    runtimeStatus: RUNTIME_STATUS_CHECKING,
    activeInstance: null,
    availableInstances: [],
    splashError: "",
    splashBusy: false,
    showCreateModal: false,
    newInstanceName: "",
    newInstanceSafetyProfile: DEFAULT_NEW_INSTANCE_SAFETY_PROFILE,
    newInstancePin: "",
    signInInstanceId: "",
    signInPin: "",
    queueJobs: [],
    activityEntries: [],
    vaultFilePath: "",
    vaultTemplatePath: "",
    secretsOptions: [],
    secretEntries: [],
    publicRpcOptions: [],
    secretsBusy: false,
    secretsError: "",
    llmCheckBusy: false,
    llmCheckMessage: "",
    llmAvailable: false,
    walletsRootRelativePath: "",
    walletsRootExists: false,
    walletNodes: [],
    walletFileCount: 0,
    walletsBusy: false,
    walletsError: "",
  });

  const loadInstances = async (): Promise<void> => {
    const response = await runtimeApi.instances();
    state.availableInstances = response.instances;
    if (response.instances.some((instance) => instance.localInstanceId === state.signInInstanceId)) {
      return;
    }
    state.signInInstanceId = response.instances[0]?.localInstanceId ?? "";
  };

  const loadAppData = async (): Promise<void> => {
    const [bootstrap, queue, activity] = await Promise.all([
      runtimeApi.bootstrap(),
      runtimeApi.queue(),
      runtimeApi.activity(RUNTIME_ACTIVITY_LIMIT),
    ]);

    state.runtimeStatus = formatRuntimeStatus(bootstrap.profile, bootstrap.llmEnabled);
    state.queueJobs = queue.jobs;
    state.activityEntries = activity.entries;
    if (bootstrap.activeInstance) {
      state.activeInstance = bootstrap.activeInstance;
    }
  };

  const refreshRuntimePanels = async (): Promise<void> => {
    if (state.phase !== "app") {
      return;
    }
    try {
      await loadAppData();
    } catch {
      state.runtimeStatus = RUNTIME_STATUS_OFFLINE;
      state.queueJobs = [];
      state.activityEntries = [];
    }
  };

  const stopPolling = (): void => {
    if (!eventsSource) {
      return;
    }
    eventsSource.close();
    eventsSource = null;
  };

  const startPolling = (): void => {
    if (state.phase !== "app" || eventsSource) {
      return;
    }

    const source = new EventSource(toRuntimeUrl(`${GUI_API_BASE_PATH}/events`));
    eventsSource = source;

    source.addEventListener("bootstrap", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as GuiBootstrapResponse;
        state.runtimeStatus = formatRuntimeStatus(payload.profile, payload.llmEnabled);
        if (payload.activeInstance) {
          state.activeInstance = payload.activeInstance;
        }
      } catch {
        // Ignore malformed stream events.
      }
    });

    source.addEventListener("queue", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as GuiQueueResponse;
        state.queueJobs = payload.jobs;
      } catch {
        // Ignore malformed stream events.
      }
    });

    source.addEventListener("activity", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as GuiActivityResponse;
        state.activityEntries = payload.entries;
      } catch {
        // Ignore malformed stream events.
      }
    });

    source.addEventListener("error", () => {
      if (eventsSource !== source) {
        return;
      }
      if (source.readyState === EventSource.CLOSED) {
        eventsSource = null;
      }
    });
  };

  const initializeSplash = async (): Promise<void> => {
    state.splashError = "";
    state.phase = "loading";
    state.splashBusy = true;
    state.runtimeStatus = RUNTIME_STATUS_CHECKING;

    const bootstrapPromise = runtimeApi.bootstrap();
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error(`Startup timed out after ${STARTUP_GUARD_TIMEOUT_MS}ms`));
      }, STARTUP_GUARD_TIMEOUT_MS);
    });

    try {
      const bootstrap = await Promise.race([bootstrapPromise, timeoutPromise]);
      state.runtimeStatus = formatRuntimeStatus(bootstrap.profile, bootstrap.llmEnabled);
      if (resolvePhaseAfterBootstrap(bootstrap.activeInstance) === "app") {
        if (!bootstrap.activeInstance) {
          throw new Error("Missing active instance for app phase.");
        }
        state.activeInstance = bootstrap.activeInstance;
        state.phase = "app";
        await loadAppData();
        await loadSecrets();
        await checkLlm();
        await loadWallets();
      } else {
        state.activeInstance = null;
        state.signInPin = "";
        await loadInstances();
        state.phase = "login";
      }
    } catch (error) {
      const errorText = error instanceof Error ? error.message : DEFAULT_RUNTIME_ERROR;
      state.runtimeStatus = RUNTIME_STATUS_OFFLINE;
      state.splashError = `${errorText}. Start runtime and retry.`;
      state.phase = "landing";
    } finally {
      state.splashBusy = false;
    }
  };

  const openCreateModal = (): void => {
    state.splashError = "";
    state.newInstanceName = "";
    state.newInstanceSafetyProfile = DEFAULT_NEW_INSTANCE_SAFETY_PROFILE;
    state.newInstancePin = "";
    state.showCreateModal = true;
  };

  const openLogin = async (): Promise<void> => {
    state.splashError = "";
    state.splashBusy = true;
    try {
      await loadInstances();
      state.phase = "login";
    } catch (error) {
      state.splashError = error instanceof Error ? error.message : DEFAULT_RUNTIME_ERROR;
      state.phase = "landing";
    } finally {
      state.splashBusy = false;
    }
  };

  const closeCreateModal = (): void => {
    state.showCreateModal = false;
  };

  const submitCreateInstance = async (): Promise<void> => {
    const name = state.newInstanceName.trim();
    if (!name) {
      state.splashError = "Instance name is required.";
      return;
    }

    state.splashBusy = true;
    state.splashError = "";
    try {
      const created = await runtimeApi.createInstance(
        buildCreateInstanceRequest({
          name,
          safetyProfile: state.newInstanceSafetyProfile,
          pin: state.newInstancePin,
        }),
      );
      const nextState = applyCreateInstanceSuccess(state.availableInstances, created.instance);
      state.availableInstances = nextState.availableInstances;
      state.signInInstanceId = nextState.signInInstanceId;
      state.signInPin = nextState.signInPin;
      state.showCreateModal = nextState.showCreateModal;
      state.phase = nextState.phase;
    } catch (error) {
      state.splashError = error instanceof Error ? error.message : DEFAULT_CREATE_INSTANCE_ERROR;
    } finally {
      state.splashBusy = false;
    }
  };

  const submitSignIn = async (createNewOption: string): Promise<void> => {
    const signInAction = resolveSignInAction(state.signInInstanceId, createNewOption);
    if (signInAction === "select-instance") {
      state.splashError = "Select an instance.";
      return;
    }

    if (signInAction === "open-create") {
      openCreateModal();
      return;
    }

    state.splashBusy = true;
    state.splashError = "";
    try {
      const signedIn = await runtimeApi.signInInstance({
        localInstanceId: state.signInInstanceId,
        userPin: state.signInPin.trim() || undefined,
      });
      state.activeInstance = signedIn.instance;
      state.phase = "app";
      await loadAppData();
      await loadSecrets();
      await checkLlm();
      await loadWallets();
    } catch (error) {
      state.splashError = error instanceof Error ? error.message : DEFAULT_SIGN_IN_ERROR;
    } finally {
      state.splashBusy = false;
    }
  };

  const loadSecrets = async (): Promise<void> => {
    state.secretsBusy = true;
    state.secretsError = "";
    try {
      const payload = await runtimeApi.secrets();
      state.vaultFilePath = payload.filePath;
      state.vaultTemplatePath = payload.templatePath;
      state.secretsOptions = payload.options;
      state.secretEntries = payload.entries;
      state.publicRpcOptions = payload.publicRpcOptions;

      const defaultRpcOptionId = payload.publicRpcOptions.find((rpc) => rpc.id === "solana-mainnet-beta")?.id
        ?? payload.publicRpcOptions[0]?.id
        ?? "";
      const defaultRpcUrl = payload.publicRpcOptions.find((rpc) => rpc.id === defaultRpcOptionId)?.url ?? "";
      const rpcEntry = payload.entries.find((entry) => entry.optionId === "solana-rpc-url");
      if (rpcEntry && !rpcEntry.value.trim() && defaultRpcOptionId && defaultRpcUrl) {
        const seeded = await runtimeApi.upsertSecret({
          optionId: "solana-rpc-url",
          value: defaultRpcUrl,
          source: "public",
          publicRpcId: defaultRpcOptionId,
        });
        state.vaultFilePath = seeded.filePath;
        state.secretEntries = state.secretEntries.map((entry) =>
          entry.optionId === seeded.entry.optionId ? seeded.entry : entry,
        );
      }
    } catch (error) {
      state.secretsError = error instanceof Error ? error.message : "Failed to load secrets.";
    } finally {
      state.secretsBusy = false;
    }
  };

  const upsertSecret = async (input: {
    optionId: string;
    value: string;
    source?: "custom" | "public";
    publicRpcId?: string | null;
  }): Promise<void> => {
    state.secretsBusy = true;
    state.secretsError = "";
    try {
      const result = await runtimeApi.upsertSecret(input);
      state.vaultFilePath = result.filePath;
      state.secretEntries = state.secretEntries.map((entry) =>
        entry.optionId === result.entry.optionId ? result.entry : entry,
      );
      const bootstrap = await runtimeApi.bootstrap();
      state.runtimeStatus = formatRuntimeStatus(bootstrap.profile, bootstrap.llmEnabled);
      await checkLlm();
    } catch (error) {
      state.secretsError = error instanceof Error ? error.message : "Failed to save secret.";
    } finally {
      state.secretsBusy = false;
    }
  };

  const clearSecret = async (optionId: string): Promise<void> => {
    state.secretsBusy = true;
    state.secretsError = "";
    try {
      const result = await runtimeApi.deleteSecret({ optionId });
      state.vaultFilePath = result.filePath;
      state.secretEntries = state.secretEntries.map((entry) =>
        entry.optionId === optionId
          ? {
              ...entry,
              value: "",
              source: "custom",
              publicRpcId: null,
            }
          : entry,
      );
      await checkLlm();
    } catch (error) {
      state.secretsError = error instanceof Error ? error.message : "Failed to clear secret.";
    } finally {
      state.secretsBusy = false;
    }
  };

  const checkLlm = async (): Promise<void> => {
    state.llmCheckBusy = true;
    state.llmCheckMessage = "";
    try {
      const result = await runtimeApi.llmCheck();
      state.llmAvailable = result.keyConfigured && result.probeOk;
      if (state.llmAvailable) {
        state.llmCheckMessage = "LLM ready.";
      } else if (!result.keyConfigured) {
        state.llmCheckMessage = "LLM not configured. Add a provider API key in Vault > LLM secrets.";
      } else {
        state.llmCheckMessage = `LLM unavailable: ${result.probeMessage}`;
      }
    } catch (error) {
      state.llmAvailable = false;
      state.llmCheckMessage = error instanceof Error ? error.message : "Failed to run LLM check.";
    } finally {
      state.llmCheckBusy = false;
    }
  };

  const loadWallets = async (): Promise<void> => {
    state.walletsBusy = true;
    state.walletsError = "";
    try {
      const payload = await runtimeApi.wallets();
      state.walletsRootRelativePath = payload.rootRelativePath;
      state.walletsRootExists = payload.rootExists;
      state.walletNodes = payload.nodes;
      state.walletFileCount = payload.walletFileCount;
    } catch (error) {
      state.walletsError = error instanceof Error ? error.message : "Failed to load wallets.";
    } finally {
      state.walletsBusy = false;
    }
  };

  return {
    state,
    initializeSplash,
    openCreateModal,
    openLogin,
    closeCreateModal,
    submitCreateInstance,
    submitSignIn,
    loadSecrets,
    loadWallets,
    upsertSecret,
    clearSecret,
    checkLlm,
    refreshRuntimePanels,
    startPolling,
    stopPolling,
  };
};
