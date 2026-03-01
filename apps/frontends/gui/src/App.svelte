<script lang="ts">
  import { onDestroy } from "svelte";
  import type { GuiUpsertSecretRequest } from "@trenchclaw/types";
  import { CREATE_NEW_OPTION } from "./config";
  import {
    ChatPanel,
    CreateInstanceModal,
    LandingSplash,
    QueuePanel,
    SecretsPanel,
    SummaryPanel,
    WorkspaceShell,
  } from "./components";
  import type { createChatController as CreateChatController } from "./features/chat/chat-controller.svelte";
  import { createRuntimeController, formatTime } from "./features/runtime/runtime-controller.svelte";

  const runtime = createRuntimeController();
  void runtime.initializeSplash();
  type ChatController = ReturnType<typeof CreateChatController>;

  let chat: ChatController | null = $state(null);
  let chatInitError = $state("");
  let activeTab: "chat" | "keys-secrets" = $state("chat");

  const ensureChatController = async (): Promise<void> => {
    if (chat) {
      return;
    }
    try {
      const { createChatController } = await import("./features/chat/chat-controller.svelte");
      chat = createChatController();
      await chat.initialize();
      chatInitError = "";
    } catch (error) {
      chatInitError = error instanceof Error ? error.message : "Failed to initialize chat module.";
      console.error("Chat initialization failed:", error);
    }
  };

  $effect(() => {
    if (runtime.state.phase === "app" && !chat) {
      void ensureChatController();
    }
  });

  onDestroy(() => {
    runtime.stopPolling();
  });
</script>

{#if runtime.state.phase === "landing"}
  <LandingSplash
    runtimeStatus={runtime.state.runtimeStatus}
    error={runtime.state.splashError}
    busy={runtime.state.splashBusy}
    onRetry={() => {
      void runtime.initializeSplash();
    }}
    onCreate={runtime.openCreateModal}
  />
{:else}
  <WorkspaceShell
    runtimeStatus={runtime.state.runtimeStatus}
    {activeTab}
    onTabChange={(tab) => {
      activeTab = tab;
    }}
  >
    {#if activeTab === "chat"}
      {#if chat}
        <ChatPanel
          messages={chat.chat.messages}
          bind:input={chat.state.input}
          conversations={chat.state.conversations}
          activeConversationId={chat.state.activeConversationId}
          sending={chat.isSending()}
          onSelectConversation={(conversationId) => {
            void chat!.selectConversation(conversationId);
          }}
          onCreateConversation={() => {
            chat!.createNewConversation();
          }}
          onSubmit={() => {
            void chat!.submitChat(runtime.refreshRuntimePanels);
          }}
        />
      {:else}
        <section class="chat-init-error">
          <p>{chatInitError || "Initializing chat..."}</p>
        </section>
      {/if}
    {:else}
      <SecretsPanel
        options={runtime.state.secretsOptions}
        entries={runtime.state.secretEntries}
        publicRpcOptions={runtime.state.publicRpcOptions}
        busy={runtime.state.secretsBusy}
        error={runtime.state.secretsError}
        notice={runtime.state.secretsNotice}
        onReload={() => {
          void runtime.loadSecrets();
        }}
        onSave={(input: GuiUpsertSecretRequest) => {
          void runtime.upsertSecret(input);
        }}
        onClear={(optionId: string) => {
          void runtime.clearSecret(optionId);
        }}
      />
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
