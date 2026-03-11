<script lang="ts">
  import { onDestroy } from "svelte";
  import { CREATE_NEW_OPTION } from "./config";
  import { APP_BUILD_COMMIT, APP_BUILD_VERSION } from "./config/build-info";
  import { SAFETY_PROFILE_OPTIONS } from "./config/app-config";
  import {
    ChatPanel,
    CreateInstanceModal,
    LandingSplash,
    LoadingSplash,
    LoginSplash,
    QueuePanel,
    SecretsPanel,
    SummaryPanel,
    WalletsPanel,
    WorkspaceShell,
  } from "./components";
  import type { createChatController as CreateChatController } from "./features/chat/chat-controller.svelte";
  import { createRuntimeController, formatTime } from "./features/runtime/runtime-controller.svelte";

  const runtime = createRuntimeController();
  void runtime.initializeSplash();
  type ChatController = ReturnType<typeof CreateChatController>;

  let chat: ChatController | null = $state(null);
  let chatInitError = $state("");
  let activeTab: "chat" | "keys-secrets" | "wallets" = $state("chat");
  const appVersionLabel = APP_BUILD_COMMIT === "local" ? APP_BUILD_VERSION : `${APP_BUILD_VERSION} (${APP_BUILD_COMMIT})`;

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
      chatInitError = error instanceof Error ? error.message : "Chat is unavailable right now.";
      console.error("Chat initialization failed:", error);
    }
  };

  $effect(() => {
    if (runtime.state.phase === "app" && !chat) {
      void ensureChatController();
    }
  });

  $effect(() => {
    if (runtime.state.phase === "app") {
      runtime.startPolling();
      return;
    }
    runtime.stopPolling();
  });

  onDestroy(() => {
    runtime.stopPolling();
  });
</script>

{#if runtime.state.phase === "loading"}
  <LoadingSplash runtimeStatus={runtime.state.runtimeStatus} />
{:else if runtime.state.phase === "landing"}
  <LandingSplash
    runtimeStatus={runtime.state.runtimeStatus}
    error={runtime.state.splashError}
    busy={runtime.state.splashBusy}
    onRetry={() => {
      void runtime.initializeSplash();
    }}
    onCreate={runtime.openCreateModal}
    onLogin={() => {
      void runtime.openLogin();
    }}
  />
{:else if runtime.state.phase === "login"}
  <LoginSplash
    instances={runtime.state.availableInstances}
    bind:selectedId={runtime.state.signInInstanceId}
    bind:pin={runtime.state.signInPin}
    createNewOption={CREATE_NEW_OPTION}
    runtimeStatus={runtime.state.runtimeStatus}
    error={runtime.state.splashError}
    busy={runtime.state.splashBusy}
    onSubmit={() => {
      void runtime.submitSignIn(CREATE_NEW_OPTION);
    }}
  />
{:else}
  <WorkspaceShell
    runtimeStatus={runtime.state.runtimeStatus}
    appVersion={appVersionLabel}
    instanceName={runtime.state.activeInstance?.name ?? ""}
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
          sending={chat.state.sending}
          chatDisabledReason={runtime.state.llmAvailable ? "" : runtime.state.llmCheckMessage}
          onSelectConversation={(conversationId) => {
            void chat?.selectConversation(conversationId);
          }}
          onCreateConversation={() => {
            chat?.createNewConversation();
          }}
          onSubmit={() => {
            void chat?.submitChat();
          }}
        />
      {:else}
        <section class="chat-init-error">
          <p>{chatInitError || "Loading chat..."}</p>
        </section>
      {/if}
    {:else if activeTab === "keys-secrets"}
      <SecretsPanel
        options={runtime.state.secretsOptions}
        entries={runtime.state.secretEntries}
        publicRpcOptions={runtime.state.publicRpcOptions}
        busy={runtime.state.secretsBusy}
        error={runtime.state.secretsError}
        llmCheckBusy={runtime.state.llmCheckBusy}
        llmCheckMessage={runtime.state.llmCheckMessage}
        onReload={() => {
          void runtime.loadSecrets();
        }}
        onCheckLlm={() => {
          void runtime.checkLlm();
        }}
        onSave={(input) => {
          void runtime.upsertSecret(input);
        }}
        onClear={(optionId) => {
          void runtime.clearSecret(optionId);
        }}
      />
    {:else}
      <WalletsPanel
        rootRelativePath={runtime.state.walletsRootRelativePath}
        rootExists={runtime.state.walletsRootExists}
        nodes={runtime.state.walletNodes}
        walletFileCount={runtime.state.walletFileCount}
        busy={runtime.state.walletsBusy}
        error={runtime.state.walletsError}
        onReload={() => {
          void runtime.loadWallets();
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
    bind:safetyProfile={runtime.state.newInstanceSafetyProfile}
    bind:pin={runtime.state.newInstancePin}
    safetyProfileOptions={SAFETY_PROFILE_OPTIONS}
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
    grid-template-rows: var(--tc-right-column-rows);
    gap: var(--tc-space-2);
  }

  .chat-init-error {
    border: var(--tc-border);
    background: var(--tc-color-black-2);
    color: var(--tc-color-red);
    padding: var(--tc-space-4);
    text-transform: uppercase;
    letter-spacing: var(--tc-status-letter-spacing);
  }

  .chat-init-error p {
    margin: 0;
  }

</style>
