<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { UIMessage } from "ai";
  import type { GuiConversationView } from "@trenchclaw/types";
  import RetroButton from "../ui/RetroButton.svelte";

  type ChatPanelProps = {
    messages?: UIMessage[];
    input?: string;
    conversations?: GuiConversationView[];
    activeConversationId?: string | null;
    sending?: boolean;
    chatDisabledReason?: string;
    onSelectConversation: (conversationId: string) => void;
    onCreateConversation: () => void;
    onSubmit: () => void;
  };

  let {
    messages = [],
    input = $bindable(""),
    conversations = [],
    activeConversationId = null,
    sending = false,
    chatDisabledReason = "",
    onSelectConversation,
    onCreateConversation,
    onSubmit,
  }: ChatPanelProps = $props();

  let showConversationModal = $state(false);
  const chatDisabled = $derived(chatDisabledReason.trim().length > 0);
  let messageViewport: HTMLDivElement | null = $state(null);
  let composer: HTMLTextAreaElement | null = $state(null);
  let shouldFollowStream = $state(true);
  const renderKey = $derived(`${messages.length}:${sending ? "1" : "0"}`);
  let lastRenderKey = "";
  const SCROLL_BOTTOM_TOLERANCE_PX = 20;
  const COMPOSER_MAX_LINES = 5;

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

  $effect(() => {
    if (renderKey !== lastRenderKey) {
      lastRenderKey = renderKey;
      void syncScrollForLatestMessages(messages.length <= 1 ? "auto" : "smooth");
    }
  });

  $effect(() => {
    input;
    resizeComposer();
  });

  onMount(() => {
    scrollToBottom("auto");
    resizeComposer();
  });
</script>

<section class="chat-root">
  <header class="chat-header">
    <span>Chat</span>
    <div class="chat-header-actions">
      <button
        type="button"
        class="conversation-picker-button"
        aria-label="Create new conversation"
        onclick={() => {
          onCreateConversation();
          showConversationModal = false;
        }}><span class="plus-icon">+</span></button
      >
      <button
        type="button"
        class="conversation-picker-button"
        aria-label="Open conversation picker"
        onclick={() => {
          showConversationModal = !showConversationModal;
        }}>▼</button
      >
    </div>
  </header>

  {#if showConversationModal}
    <section class="conversation-modal" aria-label="Conversation picker">
      <header class="conversation-modal-header">
        <span>Conversations</span>
        <button
          type="button"
          class="conversation-modal-close"
          aria-label="Close conversation picker"
          onclick={() => {
            showConversationModal = false;
          }}>x</button
        >
      </header>
      <div class="conversation-modal-list">
        {#if conversations.length === 0}
          <p class="conversation-empty">No conversations yet</p>
        {:else}
          {#each conversations as conversation (conversation.id)}
            <button
              type="button"
              class="conversation-option {activeConversationId === conversation.id ? 'active' : ''}"
              onclick={() => {
                onSelectConversation(conversation.id);
                showConversationModal = false;
              }}
            >
              {conversation.title}
            </button>
          {/each}
        {/if}
      </div>
    </section>
  {/if}

  <div class="chat-messages" bind:this={messageViewport} onscroll={onMessagesScroll}>
    {#each messages as message (message.id)}
      <div class="message-row {message.role}">
        <div class="bubble {message.role}">
          {#each message.parts as part, partIndex (`${message.id}:${partIndex}:${part.type}`)}
            {#if part.type === "text"}
              <p>{part.text}</p>
            {:else if "errorText" in part}
              <p class="error-text">Runtime error: {part.errorText}</p>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
    {#if sending}
      <div class="message-row assistant">
        <div class="bubble assistant thinking-bubble">
          <p>thinking...</p>
        </div>
      </div>
    {/if}
  </div>

  {#if chatDisabled}
    <p class="chat-disabled">{chatDisabledReason}</p>
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
      placeholder="Ask TrenchClaw..."
      disabled={chatDisabled}
      rows="1"
      spellcheck="false"
      oninput={resizeComposer}
      onkeydown={onComposerKeyDown}
    ></textarea>
    <RetroButton type="submit" disabled={sending || chatDisabled}>Send</RetroButton>
  </form>
</section>

<style>
  .chat-root {
    border: var(--tc-border);
    background: var(--tc-color-black);
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

  .plus-icon {
    font-size: 0.82rem;
    line-height: 1;
  }

  .chat-header-actions {
    display: inline-flex;
    gap: var(--tc-space-1);
  }

  .conversation-modal {
    position: absolute;
    top: 42px;
    right: 12px;
    z-index: 10;
    width: min(280px, 100%);
    border: var(--tc-border);
    background: var(--tc-color-black);
  }

  .conversation-modal-header {
    border-bottom: var(--tc-border-muted);
    color: var(--tc-color-turquoise);
    padding: var(--tc-space-2);
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .conversation-modal-close {
    border: var(--tc-border-muted);
    background: transparent;
    color: var(--tc-color-gray-2);
    width: 18px;
    height: 18px;
    padding: 0;
    cursor: pointer;
    font-size: 0.62rem;
    line-height: 1;
    text-transform: uppercase;
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
  }

  .conversation-option:last-child {
    border-bottom: 0;
  }

  .conversation-option.active {
    color: var(--tc-color-turquoise);
  }

  .chat-messages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--tc-space-2);
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
    font-weight: 300;
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .bubble.user {
    color: var(--tc-color-black);
    background: var(--tc-color-turquoise);
    border-color: var(--tc-color-turquoise);
  }

  .bubble.assistant {
    color: var(--tc-color-gray-3);
    background: var(--tc-color-black);
  }

  .thinking-bubble {
    opacity: 0.9;
    animation: pulse 1.1s ease-in-out infinite;
  }

  .bubble.system {
    color: var(--tc-color-red);
    background: var(--tc-color-black);
  }

  .bubble p {
    margin: 0;
  }

  .error-text {
    color: var(--tc-color-red);
  }

  @keyframes pulse {
    0% {
      opacity: 0.45;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.45;
    }
  }

  .chat-form {
    flex-shrink: 0;
    padding: var(--tc-space-2);
    display: grid;
    grid-template-columns: 1fr auto;
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

  .chat-composer {
    width: 100%;
    min-width: 0;
    min-height: calc(1.4em + (var(--tc-control-padding-y) * 2));
    max-height: calc((1.4em * 5) + (var(--tc-control-padding-y) * 2) + 2px);
    border: var(--tc-border-muted);
    background: var(--tc-color-black);
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
