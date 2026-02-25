<script lang="ts">
  import type { GuiActivityEntry, GuiInstanceProfileView, GuiQueueJobView } from "@trenchclaw/types";
  import CreateInstanceModal from "./components/splash/CreateInstanceModal.svelte";
  import LandingSplash from "./components/splash/LandingSplash.svelte";
  import LoginSplash from "./components/splash/LoginSplash.svelte";
  import ChatPanel from "./components/workspace/ChatPanel.svelte";
  import QueuePanel from "./components/workspace/QueuePanel.svelte";
  import Sidebar from "./components/workspace/Sidebar.svelte";
  import SummaryPanel from "./components/workspace/SummaryPanel.svelte";
  import { runtimeApi } from "./runtime-api";

  type AppPhase = "loading" | "landing" | "login" | "app";
  type ChatRow = {
    role: "assistant" | "user" | "system";
    text: string;
    timestamp: number;
  };

  const CREATE_NEW_OPTION = "__create_new__";

  let phase: AppPhase = "loading";
  let runtimeStatus = "runtime: checking...";
  let activeInstance: GuiInstanceProfileView | null = null;
  let availableInstances: GuiInstanceProfileView[] = [];
  let splashError = "";
  let splashBusy = false;
  let showCreateModal = false;

  let newInstanceName = "";
  let signInInstanceId = "";
  let signInPin = "";

  let queueJobs: GuiQueueJobView[] = [];
  let activityEntries: GuiActivityEntry[] = [];
  let chatRows: ChatRow[] = [
    {
      role: "assistant",
      text: "Console linked. Ask for actions, then verify queue and confirmations in the right panels.",
      timestamp: Date.now(),
    },
  ];
  let chatInput = "";
  let isSendingChat = false;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  const formatTime = (unixMs: number): string =>
    new Date(unixMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const addChatRow = (role: ChatRow["role"], text: string): void => {
    chatRows = [...chatRows, { role, text, timestamp: Date.now() }].slice(-250);
  };

  const loadAppData = async (): Promise<void> => {
    const [bootstrap, queue, activity] = await Promise.all([
      runtimeApi.bootstrap(),
      runtimeApi.queue(),
      runtimeApi.activity(80),
    ]);
    runtimeStatus = `runtime: ${bootstrap.profile}${bootstrap.llmEnabled ? " | llm on" : " | llm off"}`;
    queueJobs = queue.jobs;
    activityEntries = activity.entries;
    if (bootstrap.activeInstance) {
      activeInstance = bootstrap.activeInstance;
    }
  };

  const initializeSplash = async (): Promise<void> => {
    splashError = "";
    phase = "loading";
    try {
      const [bootstrap, instances] = await Promise.all([runtimeApi.bootstrap(), runtimeApi.instances()]);
      runtimeStatus = `runtime: ${bootstrap.profile}${bootstrap.llmEnabled ? " | llm on" : " | llm off"}`;
      availableInstances = instances.instances;
      phase = "landing";
      stopPolling();
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Unable to connect to runtime.";
      runtimeStatus = "runtime: offline";
      splashError = `${errorText}. Start runtime and retry.`;
      phase = "landing";
      stopPolling();
    }
  };

  const openCreateModal = (): void => {
    splashError = "";
    newInstanceName = "";
    showCreateModal = true;
  };

  const closeCreateModal = (): void => {
    showCreateModal = false;
  };

  const submitCreateInstance = async (): Promise<void> => {
    const name = newInstanceName.trim();
    if (!name) {
      splashError = "Instance name is required.";
      return;
    }

    splashBusy = true;
    splashError = "";
    try {
      const created = await runtimeApi.createInstance({ name });
      availableInstances = [created.instance, ...availableInstances];
      signInInstanceId = created.instance.localInstanceId;
      showCreateModal = false;
      phase = "login";
    } catch (error) {
      splashError = error instanceof Error ? error.message : "Failed to create instance.";
    } finally {
      splashBusy = false;
    }
  };

  const submitSignIn = async (): Promise<void> => {
    if (!signInInstanceId) {
      splashError = "Select an instance.";
      return;
    }

    if (signInInstanceId === CREATE_NEW_OPTION) {
      openCreateModal();
      return;
    }

    splashBusy = true;
    splashError = "";
    try {
      const signedIn = await runtimeApi.signInInstance({
        localInstanceId: signInInstanceId,
        userPin: signInPin.trim() || undefined,
      });
      activeInstance = signedIn.instance;
      phase = "app";
      await loadAppData();
      startPolling();
    } catch (error) {
      splashError = error instanceof Error ? error.message : "Failed to sign in.";
    } finally {
      splashBusy = false;
    }
  };

  const refreshRuntimePanels = async (): Promise<void> => {
    if (phase !== "app") {
      return;
    }
    try {
      await loadAppData();
    } catch {
      runtimeStatus = "runtime: offline";
      queueJobs = [];
      activityEntries = [];
    }
  };

  const submitChat = async (): Promise<void> => {
    const nextMessage = chatInput.trim();
    if (!nextMessage || isSendingChat) {
      return;
    }

    addChatRow("user", nextMessage);
    chatInput = "";
    isSendingChat = true;

    try {
      const payload = await runtimeApi.chat(nextMessage);
      addChatRow("assistant", payload.reply || "(empty response)");
      await refreshRuntimePanels();
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Unable to reach runtime server";
      addChatRow("system", errorText);
    } finally {
      isSendingChat = false;
    }
  };

  const startPolling = (): void => {
    if (refreshTimer) {
      return;
    }
    refreshTimer = setInterval(() => {
      void refreshRuntimePanels();
    }, 2000);
  };

  const stopPolling = (): void => {
    if (!refreshTimer) {
      return;
    }
    clearInterval(refreshTimer);
    refreshTimer = null;
  };
</script>

<svelte:window
  on:load={() => {
    void initializeSplash();
  }}
  on:beforeunload={stopPolling}
/>

{#if phase === "loading"}
  <main class="loading-shell">
    <div class="loading-card">Bootstrapping runtime connection...</div>
  </main>
{:else if phase === "landing"}
  <LandingSplash runtimeStatus={runtimeStatus} error={splashError} onCreate={openCreateModal} />
{:else if phase === "login"}
  <LoginSplash
    instances={availableInstances}
    bind:selectedId={signInInstanceId}
    bind:pin={signInPin}
    runtimeStatus={runtimeStatus}
    error={splashError}
    busy={splashBusy}
    createNewOption={CREATE_NEW_OPTION}
    onSubmit={() => {
      void submitSignIn();
    }}
  />
{:else}
  <main class="layout">
    <Sidebar instanceName={activeInstance?.name ?? "operator"} runtimeStatus={runtimeStatus} />
    <section class="workspace">
      <ChatPanel
        rows={chatRows}
        bind:input={chatInput}
        sending={isSendingChat}
        {formatTime}
        onSubmit={() => {
          void submitChat();
        }}
      />
      <section class="right-column">
        <QueuePanel jobs={queueJobs} />
        <SummaryPanel entries={activityEntries} {formatTime} />
      </section>
    </section>
  </main>
{/if}

{#if showCreateModal}
  <CreateInstanceModal
    bind:name={newInstanceName}
    busy={splashBusy}
    onCancel={closeCreateModal}
    onCreate={() => {
      void submitCreateInstance();
    }}
  />
{/if}

<style>
  .loading-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: var(--tc-space-4);
  }

  .loading-card {
    border: var(--tc-border);
    background: var(--tc-color-black-2);
    color: var(--tc-color-turquoise);
    padding: var(--tc-space-4);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.82rem;
  }

  .layout {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 110px 1fr;
  }

  .workspace {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--tc-space-3);
    padding: var(--tc-space-3);
  }

  .right-column {
    min-height: 0;
    display: grid;
    grid-template-rows: 1fr 1fr;
    gap: var(--tc-space-3);
  }

  @media (max-width: 980px) {
    .layout {
      grid-template-columns: 1fr;
    }

    .workspace {
      grid-template-columns: 1fr;
    }
  }
</style>
