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
  import type { createChatController as CreateChatController } from "./features/chat/chat-controller.svelte";
  import { createRuntimeController, formatTime } from "./features/runtime/runtime-controller.svelte";

  const runtime = createRuntimeController();
  type ChatController = ReturnType<typeof CreateChatController>;

  let chat: ChatController | null = null;
  let chatInitError = "";

  const ensureChatController = async (): Promise<void> => {
    if (chat) {
      return;
    }
    try {
      const { createChatController } = await import("./features/chat/chat-controller.svelte");
      chat = createChatController();
      chatInitError = "";
    } catch (error) {
      chatInitError = error instanceof Error ? error.message : "Failed to initialize chat module.";
      console.error("Chat initialization failed:", error);
    }
  };

  $: if (runtime.state.phase === "app" && !chat) {
    void ensureChatController();
  }
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
      void runtime.submitSignIn(CREATE_NEW_OPTION).then(() => {
        if (runtime.state.phase === "app") {
          void ensureChatController();
        }
      });
    }}
  />
{:else}
  <WorkspaceShell instanceName={runtime.state.activeInstance?.name ?? "operator"} runtimeStatus={runtime.state.runtimeStatus}>
    {#if chat}
      <ChatPanel
        messages={chat.chat.messages}
        bind:input={chat.state.input}
        sending={chat.isSending()}
        onSubmit={() => {
          void chat!.submitChat(runtime.refreshRuntimePanels);
        }}
      />
    {:else}
      <section class="chat-init-error">
        <p>{chatInitError || "Initializing chat..."}</p>
      </section>
    {/if}
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

  .chat-init-error {
    border: var(--tc-border);
    background: var(--tc-color-black);
    color: var(--tc-color-red);
    padding: var(--tc-space-4);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .chat-init-error p {
    margin: 0;
  }
</style>
