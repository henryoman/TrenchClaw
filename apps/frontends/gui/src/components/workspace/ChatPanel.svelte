<script lang="ts">
  import { onMount, tick } from "svelte";
  import { isToolUIPart, type UIMessage } from "ai";
  import { marked } from "marked";
  import type { GuiConversationView } from "@trenchclaw/types";
  import { getMessageActivityItems } from "./chat-activity";
  import RetroButton from "../ui/RetroButton.svelte";
  import RetroModal from "../ui/RetroModal.svelte";

  type ChatPanelProps = {
    messages?: UIMessage[];
    input?: string;
    conversations?: GuiConversationView[];
    activeConversationId?: string | null;
    sending?: boolean;
    deletingConversations?: boolean;
    chatDisabledReason?: string;
    runtimeError?: string;
    onSelectConversation: (conversationId: string) => void;
    onCreateConversation: () => void;
    onDeleteConversation: () => void;
    onDeleteConversations: (conversationIds: string[]) => void;
    onSubmit: () => void;
  };

  let {
    messages = [],
    input = $bindable(""),
    conversations = [],
    activeConversationId = null,
    sending = false,
    deletingConversations = false,
    chatDisabledReason = "",
    runtimeError = "",
    onSelectConversation,
    onCreateConversation,
    onDeleteConversation,
    onDeleteConversations,
    onSubmit,
  }: ChatPanelProps = $props();

  let showConversationModal = $state(false);
  let showConversationSettingsMenu = $state(false);
  let showDeleteConversationModal = $state(false);
  let showDeleteSelectedConversationsModal = $state(false);
  let conversationSelectionMode = $state(false);
  let selectedConversationIds = $state<string[]>([]);
  const chatDisabled = $derived(chatDisabledReason.trim().length > 0);
  const modalBusy = $derived(sending || deletingConversations);
  let messageViewport: HTMLDivElement | null = $state(null);
  let composer: HTMLTextAreaElement | null = $state(null);
  let conversationToggleButton: HTMLButtonElement | null = $state(null);
  let conversationModalElement: HTMLElement | null = $state(null);
  let settingsToggleButton: HTMLButtonElement | null = $state(null);
  let settingsMenuElement: HTMLElement | null = $state(null);
  let shouldFollowStream = $state(true);
  const renderKey = $derived(
    `${sending ? "1" : "0"}:${messages
      .map((message) =>
        `${message.id}:${message.role}:${message.parts
          .map((part) => {
            if (part.type === "text") {
              return `text:${part.text?.length ?? 0}`;
            }
            if (isToolUIPart(part)) {
              return `${part.toolCallId}:${part.state}:${"errorText" in part ? (part.errorText ?? "") : ""}`;
            }
            return part.type;
          })
          .join("|")}`)
      .join("::")}`,
  );
  let lastRenderKey = "";
  const SCROLL_BOTTOM_TOLERANCE_PX = 20;
  const COMPOSER_MAX_LINES = 5;
  const activeConversationTitle = $derived(
    conversations.find((conversation) => conversation.id === activeConversationId)?.title ?? "this chat",
  );
  const selectedConversationCount = $derived(selectedConversationIds.length);
  const hasSelectedConversations = $derived(selectedConversationCount > 0);

  type MessagePart = UIMessage["parts"][number];

  interface AssistantMessageSegments {
    visibleTextParts: string[];
    activityItems: ReturnType<typeof getMessageActivityItems>;
  }

  const normalizeDisplayText = (value: string): string =>
    value
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const renderMarkdown = (value: string): string => {
    const text = normalizeDisplayText(value);
    if (!text) {
      return "";
    }

    return marked.parse(text, { breaks: true }) as string;
  };

  const isTextPart = (part: MessagePart): part is Extract<MessagePart, { type: "text" }> => part.type === "text";

  const truncateText = (value: string, maxLength: number): string => {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  };

  const summarizeErrorText = (value: string): string => {
    const text = normalizeDisplayText(value);
    if (!text) {
      return "Unknown error";
    }

    const unavailableToolMatch = text.match(/unavailable tool '([^']+)'/i);
    if (unavailableToolMatch) {
      return `Unavailable tool: ${unavailableToolMatch[1]}`;
    }

    const missingFileMatch = text.match(/ENOENT: no such file or directory, open '([^']+)'/i);
    if (missingFileMatch) {
      const pathParts = missingFileMatch[1].split("/");
      return `Missing file: ${pathParts[pathParts.length - 1]}`;
    }

    const rpcErrorMatch = text.match(/\bRPC error\b[:.]?\s*(.*)$/i);
    if (rpcErrorMatch) {
      return truncateText(`RPC error${rpcErrorMatch[1] ? `: ${rpcErrorMatch[1]}` : ""}`, 96);
    }

    const firstLine = text.split("\n")[0]?.trim() ?? text;
    const firstSentence = firstLine.split(/(?<=[.!?])\s+/)[0]?.trim() ?? firstLine;
    return truncateText(firstSentence.replace(/\s+/g, " "), 96);
  };

  const getAssistantMessageSegments = (message: UIMessage): AssistantMessageSegments => {
    const visibleTextParts: string[] = [];
    const activityItems = getMessageActivityItems(message);

    message.parts.forEach((part) => {
      if (isTextPart(part)) {
        const text = normalizeDisplayText(part.text ?? "");
        if (!text) {
          return;
        }

        visibleTextParts.push(text);
      }
    });

    return {
      visibleTextParts,
      activityItems,
    };
  };

  const isNearBottom = (): boolean => {
    if (!messageViewport) {
      return true;
    }
    const remaining = messageViewport.scrollHeight - messageViewport.scrollTop - messageViewport.clientHeight;
    return remaining <= SCROLL_BOTTOM_TOLERANCE_PX;
  };

  const scrollToBottom = (behavior: ScrollBehavior): void => {
    if (!messageViewport) {
      return;
    }
    messageViewport.scrollTo({
      top: messageViewport.scrollHeight,
      behavior,
    });
  };

  const onMessagesScroll = (): void => {
    shouldFollowStream = isNearBottom();
  };

  const syncScrollForLatestMessages = async (behavior: ScrollBehavior): Promise<void> => {
    await tick();
    if (!messageViewport) {
      return;
    }
    if (!shouldFollowStream && !sending) {
      return;
    }
    scrollToBottom(behavior);
  };

  const resizeComposer = (): void => {
    if (!composer) {
      return;
    }

    const styles = window.getComputedStyle(composer);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 18;
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
    const borderTop = Number.parseFloat(styles.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(styles.borderBottomWidth) || 0;
    const maxHeight = lineHeight * COMPOSER_MAX_LINES + paddingTop + paddingBottom + borderTop + borderBottom;

    composer.style.height = "auto";
    const nextHeight = Math.min(composer.scrollHeight, maxHeight);
    composer.style.height = `${nextHeight}px`;
    composer.style.overflowY = composer.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  const submitChat = (): void => {
    if (chatDisabled || sending) {
      return;
    }
    onSubmit();
    void syncScrollForLatestMessages("smooth");
  };

  const onComposerKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    event.preventDefault();
    submitChat();
  };

  const resetConversationSelection = (): void => {
    conversationSelectionMode = false;
    selectedConversationIds = [];
  };

  const closeConversationModal = (): void => {
    showConversationModal = false;
    showDeleteSelectedConversationsModal = false;
    resetConversationSelection();
  };

  const toggleConversationSelectionMode = (): void => {
    if (modalBusy || conversations.length === 0) {
      return;
    }
    if (conversationSelectionMode) {
      resetConversationSelection();
      return;
    }
    conversationSelectionMode = true;
    selectedConversationIds = [];
  };

  const toggleConversationSelection = (conversationId: string): void => {
    if (modalBusy) {
      return;
    }
    if (selectedConversationIds.includes(conversationId)) {
      selectedConversationIds = selectedConversationIds.filter((candidateId) => candidateId !== conversationId);
      return;
    }
    selectedConversationIds = [...selectedConversationIds, conversationId];
  };

  const confirmDeleteSelectedConversations = (): void => {
    const conversationIds = [...selectedConversationIds];
    if (conversationIds.length === 0 || modalBusy) {
      return;
    }
    closeConversationModal();
    onDeleteConversations(conversationIds);
  };

  const closeHeaderMenus = (): void => {
    closeConversationModal();
    showConversationSettingsMenu = false;
  };

  const onGlobalPointerDown = (event: PointerEvent): void => {
    if (showDeleteConversationModal || showDeleteSelectedConversationsModal) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    const isInsideConversationMenu =
      conversationModalElement?.contains(target) || conversationToggleButton?.contains(target);
    if (!isInsideConversationMenu) {
      closeConversationModal();
    }

    const isInsideSettingsMenu = settingsMenuElement?.contains(target) || settingsToggleButton?.contains(target);
    if (!isInsideSettingsMenu) {
      showConversationSettingsMenu = false;
    }
  };

  const onGlobalKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }

    if (showDeleteConversationModal) {
      showDeleteConversationModal = false;
      return;
    }

    if (showDeleteSelectedConversationsModal) {
      showDeleteSelectedConversationsModal = false;
      return;
    }

    closeHeaderMenus();
  };

  $effect(() => {
    if (renderKey !== lastRenderKey) {
      lastRenderKey = renderKey;
      void syncScrollForLatestMessages(messages.length <= 1 ? "auto" : "smooth");
    }
  });

  $effect(() => {
    void input;
    resizeComposer();
  });

  $effect(() => {
    const conversationIdSet = new Set(conversations.map((conversation) => conversation.id));
    if (selectedConversationIds.some((conversationId) => !conversationIdSet.has(conversationId))) {
      selectedConversationIds = selectedConversationIds.filter((conversationId) => conversationIdSet.has(conversationId));
    }
    if (conversationSelectionMode && conversations.length === 0) {
      resetConversationSelection();
    }
  });

  onMount(() => {
    scrollToBottom("auto");
    resizeComposer();
    document.addEventListener("pointerdown", onGlobalPointerDown);
    window.addEventListener("keydown", onGlobalKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onGlobalPointerDown);
      window.removeEventListener("keydown", onGlobalKeyDown);
    };
  });
</script>

<section class="chat-root">
  <header class="chat-header">
    <span>Chat</span>
    <div class="chat-header-actions">
      <button
        bind:this={settingsToggleButton}
        type="button"
        class="conversation-picker-button conversation-settings-toggle"
        aria-label="Conversation settings"
        aria-haspopup="menu"
        aria-expanded={showConversationSettingsMenu}
        disabled={deletingConversations}
        onclick={() => {
          showConversationSettingsMenu = !showConversationSettingsMenu;
          closeConversationModal();
        }}
      >
        <svg class="settings-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M8 1.4 9.5 5.2 13.7 2.9 10.8 6.3 14.8 8 10.8 9.7 13.7 13.1 9.5 10.8 8 14.6 6.5 10.8 2.3 13.1 5.2 9.7 1.2 8 5.2 6.3 2.3 2.9 6.5 5.2Z" />
          <path d="M8 6.2v3.6M6.2 8h3.6" />
        </svg>
      </button
      >
      <button
        type="button"
        class="conversation-picker-button"
        aria-label="Create new conversation"
        disabled={deletingConversations}
        onclick={() => {
          onCreateConversation();
          closeHeaderMenus();
        }}
      >
        <svg class="plus-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M8 3.5v9M3.5 8h9" />
        </svg></button
      >
      <button
        bind:this={conversationToggleButton}
        type="button"
        class="conversation-picker-button conversation-picker-toggle"
        aria-label="Open conversations"
        aria-haspopup="dialog"
        aria-expanded={showConversationModal}
        disabled={deletingConversations}
        onclick={() => {
          if (showConversationModal) {
            closeConversationModal();
          } else {
            showConversationModal = true;
          }
          showConversationSettingsMenu = false;
        }}
      >
        <span
          class="conversation-picker-caret"
          class:is-open={showConversationModal}
          aria-hidden="true">▼</span
        >
      </button>
    </div>
  </header>

  {#if showConversationModal}
    <section bind:this={conversationModalElement} class="conversation-modal" aria-label="Conversations">
      <header class="conversation-modal-header">
        <div class="conversation-modal-heading">
          <span class="conversation-modal-title">conversations</span>
        </div>
        <div class="conversation-modal-header-actions">
          <button
            type="button"
            class="conversation-modal-delete-action"
            class:is-visible={conversationSelectionMode}
            aria-hidden={!conversationSelectionMode}
            disabled={!conversationSelectionMode || !hasSelectedConversations || modalBusy}
            onclick={() => {
              showDeleteSelectedConversationsModal = true;
            }}
          >
            Delete
          </button>
          <button
            type="button"
            class="conversation-modal-icon-button conversation-modal-select-toggle"
            aria-label={conversationSelectionMode ? "Exit conversation selection mode" : "Select conversations to delete"}
            aria-pressed={conversationSelectionMode}
            disabled={modalBusy || conversations.length === 0}
            onclick={toggleConversationSelectionMode}
          >
            <svg class="conversation-modal-trash-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M3.5 4.5h9" />
              <path d="M6 2.7h4" />
              <path d="M5 4.5v7.1c0 .5.4.9.9.9h4.2c.5 0 .9-.4.9-.9V4.5" />
              <path d="M6.8 6.5v4.2M9.2 6.5v4.2" />
            </svg>
          </button>
          <button
            type="button"
            class="conversation-modal-icon-button conversation-modal-close"
            aria-label="Close conversations"
            onclick={closeConversationModal}
          >
            <svg class="conversation-modal-close-icon" viewBox="0 0 8 8" aria-hidden="true" focusable="false">
              <path d="M1 1L7 7M7 1L1 7" />
            </svg>
          </button
          >
        </div>
      </header>
      <div class="conversation-modal-list">
        {#if conversations.length === 0}
          <p class="conversation-empty">No conversations yet</p>
        {:else}
          {#each conversations as conversation (conversation.id)}
            {@const isSelected = selectedConversationIds.includes(conversation.id)}
            {#if conversationSelectionMode}
              <label
                class="conversation-option conversation-option-selectable {isSelected ? 'selected' : ''} {activeConversationId === conversation.id ? 'active' : ''}"
              >
                <input
                  type="checkbox"
                  class="conversation-option-checkbox"
                  checked={isSelected}
                  disabled={modalBusy}
                  onchange={() => {
                    toggleConversationSelection(conversation.id);
                  }}
                />
                <span class="conversation-option-checkbox-frame" aria-hidden="true">
                  {#if isSelected}
                    <svg class="conversation-option-check-icon" viewBox="0 0 10 10" focusable="false">
                      <path d="M1.5 5.2 4 7.7 8.5 2.8" />
                    </svg>
                  {/if}
                </span>
                <span class="conversation-option-title">{conversation.title}</span>
              </label>
            {:else}
              <button
                type="button"
                class="conversation-option {activeConversationId === conversation.id ? 'active' : ''}"
                disabled={modalBusy}
                onclick={() => {
                  onSelectConversation(conversation.id);
                  closeConversationModal();
                }}
              >
                <span class="conversation-option-title">{conversation.title}</span>
              </button>
            {/if}
          {/each}
        {/if}
      </div>
    </section>
  {/if}

  {#if showConversationSettingsMenu}
    <section bind:this={settingsMenuElement} class="conversation-settings-menu" aria-label="Conversation settings">
      <button
        type="button"
        class="conversation-settings-option danger"
        disabled={!activeConversationId || modalBusy}
        onclick={() => {
          showConversationSettingsMenu = false;
          showDeleteConversationModal = true;
        }}
      >
        Delete chat
      </button>
    </section>
  {/if}

  <div class="chat-stage">
    <div class="chat-messages" bind:this={messageViewport} onscroll={onMessagesScroll}>
      {#each messages as message (message.id)}
        {#if message.role === "assistant"}
          {@const segments = getAssistantMessageSegments(message)}

          {#if segments.visibleTextParts.length > 0 || segments.activityItems.length > 0}
            <div class="message-row assistant">
              <div class="bubble assistant">
                {#each segments.visibleTextParts as text, textIndex (`${message.id}:visible:${textIndex}`)}
                  {@const html = renderMarkdown(text)}
                  {#if html}
                    <div class="markdown-content">{@html html}</div>
                  {/if}
                {/each}

                {#if segments.activityItems.length > 0}
                  <section class={`assistant-activity ${segments.visibleTextParts.length > 0 ? "with-copy" : ""}`}>
                    <div class="assistant-activity-header">
                      <p>Live agent activity</p>
                    </div>

                    <div class="assistant-activity-list">
                      {#each segments.activityItems as item (item.id)}
                        <article class={`assistant-activity-card tone-${item.tone}`}>
                          <div class="assistant-activity-card-head">
                            <span class="assistant-activity-badge">{item.badge}</span>
                            <h4>{item.title}</h4>
                          </div>
                          <p>{item.detail}</p>
                          {#if item.meta}
                            <small>{item.meta}</small>
                          {/if}
                        </article>
                      {/each}
                    </div>
                  </section>
                {/if}
              </div>
            </div>
          {/if}
        {:else}
          <div class="message-row {message.role}">
            <div class="bubble {message.role}">
              {#each message.parts as part, partIndex (`${message.id}:${partIndex}:${part.type}`)}
                {#if part.type === "text"}
                  <p>{normalizeDisplayText(part.text ?? "")}</p>
                {:else if "errorText" in part && typeof part.errorText === "string"}
                  {@const normalizedErrorText = normalizeDisplayText(part.errorText)}
                  <p class="error-text" title={normalizedErrorText}>Error: {summarizeErrorText(normalizedErrorText)}</p>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>

  </div>

  {#if chatDisabled}
    <p class="chat-disabled">{chatDisabledReason}</p>
  {/if}

  {#if runtimeError.trim().length > 0}
    <p class="chat-runtime-error">{runtimeError}</p>
  {/if}

  <form
    class="chat-form"
    onsubmit={(event) => {
      event.preventDefault();
      submitChat();
    }}
  >
    <textarea
      bind:this={composer}
      bind:value={input}
      class="chat-composer"
      placeholder="Type a message"
      disabled={chatDisabled || deletingConversations}
      rows="1"
      spellcheck="false"
      oninput={resizeComposer}
      onkeydown={onComposerKeyDown}
    ></textarea>
    <RetroButton type="submit" disabled={sending || chatDisabled || deletingConversations}>Send</RetroButton>
  </form>

  {#if showDeleteConversationModal}
    <RetroModal title="Delete chat">
      <p class="delete-conversation-copy">
        Are you sure you want to delete <span>{activeConversationTitle}</span>?
      </p>
      <p class="delete-conversation-copy muted">This removes the conversation history for this chat.</p>
      <div class="delete-conversation-actions">
        <RetroButton
          variant="secondary"
          disabled={modalBusy}
          on:click={() => {
            showDeleteConversationModal = false;
          }}>Cancel</RetroButton
        >
        <RetroButton
          variant="danger"
          disabled={!activeConversationId || modalBusy}
          on:click={() => {
            showDeleteConversationModal = false;
            onDeleteConversation();
          }}>Delete</RetroButton
        >
      </div>
    </RetroModal>
  {/if}

  {#if showDeleteSelectedConversationsModal}
    <RetroModal title="Delete conversations">
      <p class="delete-conversation-copy">Are you sure you want to delete all of these conversations?</p>
      <p class="delete-conversation-copy">
        <span>{selectedConversationCount}</span>
        conversation{selectedConversationCount === 1 ? "" : "s"} selected.
      </p>
      <p class="delete-conversation-copy muted">This removes the conversation history for each selected chat.</p>
      <div class="delete-conversation-actions">
        <RetroButton
          variant="secondary"
          disabled={modalBusy}
          on:click={() => {
            showDeleteSelectedConversationsModal = false;
          }}>Cancel</RetroButton
        >
        <RetroButton
          variant="danger"
          disabled={!hasSelectedConversations || modalBusy}
          on:click={confirmDeleteSelectedConversations}>Delete</RetroButton
        >
      </div>
    </RetroModal>
  {/if}
</section>

<style>
  .chat-root {
    border: var(--tc-border);
    background: var(--tc-color-black-2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }

  .chat-header {
    flex-shrink: 0;
    border-bottom: var(--tc-border-muted);
    color: var(--tc-color-turquoise);
    padding: 10px 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.86rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .conversation-picker-button {
    width: 22px;
    height: 22px;
    border: var(--tc-border-muted);
    background: transparent;
    color: var(--tc-color-turquoise);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    font-size: 0.68rem;
    line-height: 1;
  }

  .conversation-picker-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .conversation-picker-toggle {
    color: var(--tc-color-lime);
  }

  .conversation-settings-toggle {
    color: var(--tc-color-lime);
  }

  .conversation-picker-caret {
    display: inline-flex;
    line-height: 1;
    transform-origin: center;
    transition: transform 160ms ease;
  }

  .conversation-picker-caret.is-open {
    transform: rotate(180deg);
  }

  .plus-icon {
    width: 10px;
    height: 10px;
    display: block;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: square;
    fill: none;
  }

  .settings-icon {
    width: 12px;
    height: 12px;
    display: block;
    stroke: currentColor;
    stroke-width: 1.1;
    stroke-linecap: square;
    stroke-linejoin: bevel;
    fill: none;
  }

  .chat-header-actions {
    display: inline-flex;
    gap: var(--tc-space-1);
  }

  .chat-stage {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .conversation-modal {
    position: absolute;
    top: 42px;
    right: 12px;
    z-index: 10;
    width: min(280px, 100%);
    border: var(--tc-border);
    background: var(--tc-color-black-2);
  }

  .conversation-settings-menu {
    position: absolute;
    top: 42px;
    right: 52px;
    z-index: 10;
    min-width: 160px;
    border: var(--tc-border);
    background: var(--tc-color-black-2);
    display: flex;
    flex-direction: column;
  }

  .conversation-modal-header {
    border-bottom: var(--tc-border-muted);
    padding: var(--tc-space-2);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--tc-space-2);
  }

  .conversation-modal-heading {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }

  .conversation-modal-title {
    color: var(--tc-color-cream);
    font-size: var(--tc-type-md);
    font-weight: 700;
    line-height: 1.2;
  }

  .conversation-modal-header-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--tc-space-1);
  }

  .conversation-modal-delete-action {
    min-width: 4.75rem;
    height: 18px;
    border: var(--tc-border-muted);
    background: transparent;
    color: var(--tc-color-red);
    padding: 0 0.45rem;
    font-family: inherit;
    font-size: 0.64rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
    visibility: hidden;
    pointer-events: none;
    opacity: 0;
  }

  .conversation-modal-delete-action.is-visible {
    visibility: visible;
    pointer-events: auto;
    opacity: 1;
  }

  .conversation-modal-delete-action:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .conversation-modal-icon-button {
    border: var(--tc-border-muted);
    background: transparent;
    color: var(--tc-color-gray-2);
    width: 18px;
    height: 18px;
    padding: 0;
    cursor: pointer;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  .conversation-modal-icon-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .conversation-modal-close {
    color: var(--tc-color-gray-2);
  }

  .conversation-modal-select-toggle {
    color: var(--tc-color-red);
  }

  .conversation-modal-select-toggle[aria-pressed="true"] {
    border-color: var(--tc-color-red);
    background: color-mix(in srgb, var(--tc-color-red) 14%, transparent);
  }

  .conversation-modal-close-icon {
    width: 8px;
    height: 8px;
    stroke: currentColor;
    stroke-width: 1.25;
    fill: none;
  }

  .conversation-modal-trash-icon {
    width: 10px;
    height: 10px;
    stroke: currentColor;
    stroke-width: 1.15;
    stroke-linecap: square;
    stroke-linejoin: bevel;
    fill: none;
  }

  .conversation-modal-list {
    display: flex;
    flex-direction: column;
  }

  .conversation-empty {
    margin: 0;
    padding: var(--tc-space-2);
    color: var(--tc-color-gray-2);
    font-size: 0.72rem;
    text-transform: uppercase;
  }

  .conversation-option {
    border: 0;
    border-bottom: var(--tc-border-muted);
    background: transparent;
    color: var(--tc-color-gray-1);
    padding: var(--tc-space-2);
    font-family: inherit;
    font-size: 0.72rem;
    text-transform: uppercase;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--tc-space-2);
  }

  .conversation-option:last-child {
    border-bottom: 0;
  }

  .conversation-option.active {
    color: var(--tc-color-turquoise);
  }

  .conversation-option:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .conversation-option-selectable {
    position: relative;
  }

  .conversation-option.selected {
    color: var(--tc-color-cream);
    background: color-mix(in srgb, var(--tc-color-red) 10%, transparent);
  }

  .conversation-option-checkbox {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .conversation-option-checkbox-frame {
    width: 13px;
    height: 13px;
    border: var(--tc-border-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--tc-color-red);
    background: transparent;
  }

  .conversation-option-title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conversation-option-check-icon {
    width: 8px;
    height: 8px;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: square;
    stroke-linejoin: bevel;
    fill: none;
  }

  .conversation-settings-option {
    border: 0;
    background: transparent;
    color: var(--tc-color-gray-1);
    padding: var(--tc-space-2);
    font-family: inherit;
    font-size: 0.72rem;
    text-transform: uppercase;
    text-align: left;
    cursor: pointer;
  }

  .conversation-settings-option.danger {
    color: var(--tc-color-red);
  }

  .conversation-settings-option:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .conversation-settings-option:not(:disabled):hover {
    color: var(--tc-color-cream);
    background: var(--tc-color-gray-2);
  }

  .chat-messages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--tc-space-1) var(--tc-space-2) var(--tc-space-2);
    display: flex;
    flex-direction: column;
    gap: var(--tc-space-2);
  }

  .message-row {
    display: flex;
  }

  .message-row.user {
    justify-content: flex-end;
  }

  .message-row.assistant,
  .message-row.system {
    justify-content: flex-start;
  }

  .bubble {
    max-width: 90%;
    border: var(--tc-border-muted);
    padding: var(--tc-space-2) var(--tc-space-3);
    font-size: var(--tc-chat-text-size);
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .bubble.user {
    color: var(--tc-color-lime);
    background: var(--tc-color-gray-2);
    border-color: var(--tc-color-gray-2);
    font-weight: 100;
  }

  .bubble.assistant {
    color: var(--tc-color-gray-3);
    background: var(--tc-color-black-2);
    font-weight: 100;
  }

  .bubble.system {
    color: var(--tc-color-red);
    background: var(--tc-color-black-2);
  }

  .bubble p {
    margin: 0;
  }

  .markdown-content {
    white-space: normal;
  }

  .markdown-content + .markdown-content {
    margin-top: var(--tc-space-2);
  }

  .assistant-activity {
    margin-top: var(--tc-space-2);
    padding-top: var(--tc-space-2);
    border-top: var(--tc-border-muted);
    display: grid;
    gap: var(--tc-space-2);
  }

  .assistant-activity.with-copy {
    margin-top: var(--tc-space-3);
  }

  .assistant-activity-header p {
    margin: 0;
    color: var(--tc-color-gray-2);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: var(--tc-track-wide);
  }

  .assistant-activity-list {
    display: grid;
    gap: var(--tc-space-2);
  }

  .assistant-activity-card {
    display: grid;
    gap: 6px;
    padding: var(--tc-space-2);
    border: var(--tc-border-muted);
    background: color-mix(in srgb, var(--tc-color-black-light) 88%, transparent);
  }

  .assistant-activity-card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .assistant-activity-badge {
    flex-shrink: 0;
    min-width: 3.5rem;
    padding: 2px 6px;
    border: var(--tc-border-muted);
    color: var(--tc-color-gray-3);
    font-size: 10px;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: var(--tc-track-wide);
  }

  .assistant-activity-card h4,
  .assistant-activity-card p,
  .assistant-activity-card small {
    margin: 0;
  }

  .assistant-activity-card h4 {
    min-width: 0;
    color: var(--tc-color-cream);
    font-size: 0.86rem;
    font-weight: 500;
    line-height: 1.3;
  }

  .assistant-activity-card p {
    color: var(--tc-color-gray-3);
    font-size: 0.76rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .assistant-activity-card small {
    color: var(--tc-color-gray-2);
    font-size: 10px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .assistant-activity-card.tone-pending,
  .assistant-activity-card.tone-running {
    border-color: color-mix(in srgb, var(--tc-color-turquoise) 42%, var(--tc-color-gray-2));
    background: color-mix(in srgb, var(--tc-color-turquoise) 7%, var(--tc-color-black-light));
  }

  .assistant-activity-card.tone-queued {
    border-color: color-mix(in srgb, var(--tc-color-lime) 45%, var(--tc-color-gray-2));
    background: color-mix(in srgb, var(--tc-color-lime) 7%, var(--tc-color-black-light));
  }

  .assistant-activity-card.tone-done {
    border-color: color-mix(in srgb, var(--tc-color-cream) 28%, var(--tc-color-gray-2));
  }

  .assistant-activity-card.tone-error {
    border-color: color-mix(in srgb, var(--tc-color-red) 56%, var(--tc-color-gray-2));
    background: color-mix(in srgb, var(--tc-color-red) 8%, var(--tc-color-black-light));
  }

  .markdown-content :global(*) {
    max-width: 100%;
  }

  .markdown-content :global(p),
  .markdown-content :global(ul),
  .markdown-content :global(ol),
  .markdown-content :global(pre),
  .markdown-content :global(blockquote),
  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3),
  .markdown-content :global(h4),
  .markdown-content :global(h5),
  .markdown-content :global(h6) {
    margin: 0 0 var(--tc-space-2) 0;
  }

  .markdown-content :global(:last-child) {
    margin-bottom: 0;
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    padding-left: 1.25rem;
  }

  .markdown-content :global(li + li) {
    margin-top: 0.2rem;
  }

  .markdown-content :global(code) {
    font-family: inherit;
  }

  .markdown-content :global(strong),
  .markdown-content :global(b) {
    font-weight: 600;
  }

  .markdown-content :global(pre) {
    overflow-x: auto;
    border: var(--tc-border-muted);
    padding: var(--tc-space-2);
  }

  .markdown-content :global(pre code) {
    white-space: pre;
  }

  .markdown-content :global(a) {
    color: var(--tc-color-turquoise);
  }

  .markdown-content :global(blockquote) {
    margin-left: 0;
    padding-left: var(--tc-space-2);
    border-left: var(--tc-border-muted);
    color: var(--tc-color-gray-2);
  }

  .error-text {
    color: var(--tc-color-red);
  }

  .chat-form {
    flex-shrink: 0;
    padding: var(--tc-space-2);
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--tc-space-2);
  }

  .delete-conversation-copy {
    margin: 0;
    color: var(--tc-color-gray-3);
    font-size: 0.8rem;
    line-height: 1.45;
    text-transform: uppercase;
  }

  .delete-conversation-copy span {
    color: var(--tc-color-red);
  }

  .delete-conversation-copy.muted {
    color: var(--tc-color-gray-1);
  }

  .delete-conversation-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--tc-space-2);
  }

  .chat-disabled {
    margin: 0;
    border-top: var(--tc-border-muted);
    color: var(--tc-color-red);
    padding: var(--tc-space-2) var(--tc-space-3);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: var(--tc-sidebar-letter-spacing);
  }

  .chat-runtime-error {
    margin: 0;
    border-top: var(--tc-border-muted);
    color: var(--tc-color-red);
    padding: var(--tc-space-2) var(--tc-space-3);
    font-size: 0.72rem;
    letter-spacing: var(--tc-sidebar-letter-spacing);
  }

  .chat-composer {
    width: 100%;
    min-width: 0;
    min-height: calc(1.4em + (var(--tc-control-padding-y) * 2));
    max-height: calc((1.4em * 5) + (var(--tc-control-padding-y) * 2) + 2px);
    border: var(--tc-border-muted);
    background: var(--tc-color-black-2);
    color: var(--tc-color-gray-3);
    padding: var(--tc-control-padding-y) var(--tc-control-padding-x);
    font-family: inherit;
    font-size: var(--tc-chat-text-size);
    line-height: 1.4;
    resize: none;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    scrollbar-width: none;
  }

  .chat-composer:focus {
    border-color: var(--tc-color-turquoise);
    outline: none;
  }

  .chat-composer::-webkit-scrollbar {
    display: none;
  }

  .chat-composer::placeholder {
    color: var(--tc-color-turquoise);
  }

</style>
