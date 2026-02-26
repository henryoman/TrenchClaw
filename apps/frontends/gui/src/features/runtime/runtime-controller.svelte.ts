import type { GuiActivityEntry, GuiInstanceProfileView, GuiQueueJobView } from "@trenchclaw/types";
import {
  DEFAULT_CREATE_INSTANCE_ERROR,
  DEFAULT_RUNTIME_ERROR,
  DEFAULT_SIGN_IN_ERROR,
  RUNTIME_ACTIVITY_LIMIT,
  RUNTIME_REFRESH_INTERVAL_MS,
  RUNTIME_STATUS_CHECKING,
  RUNTIME_STATUS_OFFLINE,
  STARTUP_GUARD_TIMEOUT_MS,
} from "../../config/app-config";
import { runtimeApi } from "../../runtime-api";

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
  signInInstanceId: string;
  signInPin: string;
  queueJobs: GuiQueueJobView[];
  activityEntries: GuiActivityEntry[];
}

const formatRuntimeStatus = (profile: string, llmEnabled: boolean): string =>
  `runtime: ${profile}${llmEnabled ? " | llm on" : " | llm off"}`;

export const formatTime = (unixMs: number): string =>
  new Date(unixMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const createRuntimeController = () => {
  const state = $state<RuntimeUiState>({
    phase: "landing",
    runtimeStatus: RUNTIME_STATUS_CHECKING,
    activeInstance: null,
    availableInstances: [],
    splashError: "",
    splashBusy: false,
    showCreateModal: false,
    newInstanceName: "",
    signInInstanceId: "",
    signInPin: "",
    queueJobs: [],
    activityEntries: [],
  });

  let refreshTimer: ReturnType<typeof setInterval> | null = null;

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

  const startPolling = (): void => {
    if (refreshTimer) {
      return;
    }
    refreshTimer = setInterval(() => {
      void refreshRuntimePanels();
    }, RUNTIME_REFRESH_INTERVAL_MS);
  };

  const stopPolling = (): void => {
    if (!refreshTimer) {
      return;
    }
    clearInterval(refreshTimer);
    refreshTimer = null;
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
      if (bootstrap.activeInstance) {
        state.activeInstance = bootstrap.activeInstance;
      }
      state.phase = "app";
      await loadAppData();
      startPolling();
    } catch (error) {
      const errorText = error instanceof Error ? error.message : DEFAULT_RUNTIME_ERROR;
      state.runtimeStatus = RUNTIME_STATUS_OFFLINE;
      state.splashError = `${errorText}. Start runtime and retry.`;
      state.phase = "landing";
      stopPolling();
    } finally {
      state.splashBusy = false;
    }
  };

  const openCreateModal = (): void => {
    state.splashError = "";
    state.newInstanceName = "";
    state.showCreateModal = true;
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
      const created = await runtimeApi.createInstance({ name });
      state.availableInstances = [created.instance, ...state.availableInstances];
      state.signInInstanceId = created.instance.localInstanceId;
      state.showCreateModal = false;
      state.phase = "login";
    } catch (error) {
      state.splashError = error instanceof Error ? error.message : DEFAULT_CREATE_INSTANCE_ERROR;
    } finally {
      state.splashBusy = false;
    }
  };

  const submitSignIn = async (createNewOption: string): Promise<void> => {
    if (!state.signInInstanceId) {
      state.splashError = "Select an instance.";
      return;
    }

    if (state.signInInstanceId === createNewOption) {
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
      startPolling();
    } catch (error) {
      state.splashError = error instanceof Error ? error.message : DEFAULT_SIGN_IN_ERROR;
    } finally {
      state.splashBusy = false;
    }
  };

  return {
    state,
    initializeSplash,
    openCreateModal,
    closeCreateModal,
    submitCreateInstance,
    submitSignIn,
    refreshRuntimePanels,
    startPolling,
    stopPolling,
  };
};
