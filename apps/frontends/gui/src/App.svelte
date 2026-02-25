<script lang="ts">
  import { CREATE_NEW_OPTION } from "./config";
  import {
    ChatPanel,
    CreateInstanceModal,
    LandingSplash,
    LoadingSplash,
    LoginSplash,
    QueuePanel,
    SummaryPanel,
    WorkspaceShell,
  } from "./components";
  import { createChatController, createRuntimeController, formatTime } from "./features";

  const runtime = createRuntimeController();
  const chat = createChatController();
</script>

<svelte:window
  on:load={() => {
    void runtime.initializeSplash();
  }}
  on:beforeunload={runtime.stopPolling}
/>

{#if runtime.state.phase === "loading"}
  <LoadingSplash />
{:else if runtime.state.phase === "landing"}
  <LandingSplash
    runtimeStatus={runtime.state.runtimeStatus}
    error={runtime.state.splashError}
    onCreate={runtime.openCreateModal}
  />
{:else if runtime.state.phase === "login"}
  <LoginSplash
    instances={runtime.state.availableInstances}
    bind:selectedId={runtime.state.signInInstanceId}
    bind:pin={runtime.state.signInPin}
    runtimeStatus={runtime.state.runtimeStatus}
    error={runtime.state.splashError}
    busy={runtime.state.splashBusy}
    createNewOption={CREATE_NEW_OPTION}
    onSubmit={() => {
      void runtime.submitSignIn(CREATE_NEW_OPTION);
    }}
  />
{:else}
  <WorkspaceShell instanceName={runtime.state.activeInstance?.name ?? "operator"} runtimeStatus={runtime.state.runtimeStatus}>
    <ChatPanel
      messages={chat.chat.messages}
      bind:input={chat.state.input}
      sending={chat.isSending()}
      onSubmit={() => {
        void chat.submitChat(runtime.refreshRuntimePanels);
      }}
    />
    <section class="right-column">
      <QueuePanel jobs={runtime.state.queueJobs} />
      <SummaryPanel entries={runtime.state.activityEntries} {formatTime} />
    </section>
  </WorkspaceShell>
{/if}

{#if runtime.state.showCreateModal}
  <CreateInstanceModal
    bind:name={runtime.state.newInstanceName}
    busy={runtime.state.splashBusy}
    onCancel={runtime.closeCreateModal}
    onCreate={() => {
      void runtime.submitCreateInstance();
    }}
  />
{/if}

<style>
  .right-column {
    min-height: 0;
    display: grid;
    grid-template-rows: 1fr 1fr;
    gap: var(--tc-space-3);
  }
</style>
