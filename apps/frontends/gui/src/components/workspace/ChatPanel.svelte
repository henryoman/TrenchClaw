<script lang="ts">
  import type { UIMessage } from "ai";
  import type { GuiConversationView } from "@trenchclaw/types";
  import RetroButton from "../ui/RetroButton.svelte";
  import RetroInput from "../ui/RetroInput.svelte";

  export let messages: UIMessage[] = [];
  export let input = "";
  export let conversations: GuiConversationView[] = [];
  export let activeConversationId: string | null = null;
  export let sending = false;
  export let onSelectConversation: (conversationId: string) => void;
  export let onCreateConversation: () => void;
  export let onSubmit: () => void;

  let showConversationModal = false;
</script>

<section class="chat-root">
  <header class="chat-header">
    <span>Chat</span>
    <div class="chat-header-actions">
      <button
        type="button"
        class="conversation-picker-button"
        aria-label="Create new conversation"
        on:click={() => {
          onCreateConversation();
          showConversationModal = false;
        }}><span class="plus-icon">+</span></button
      >
      <button
        type="button"
        class="conversation-picker-button"
        aria-label="Open conversation picker"
        on:click={() => {
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
          on:click={() => {
            showConversationModal = false;
          }}>x</button
        >
      </header>
      <div class="conversation-modal-list">
        {#if conversations.length === 0}
          <p class="conversation-empty">No conversations yet</p>
        {:else}
          {#each conversations as conversation}
            <button
              type="button"
              class="conversation-option {activeConversationId === conversation.id ? 'active' : ''}"
              on:click={() => {
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

  <div class="chat-messages">
    {#each messages as message}
      <div class="message-row {message.role}">
        <div class="bubble {message.role}">
          {#each message.parts as part}
            {#if part.type === "text"}
              <p>{part.text}</p>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <form
    class="chat-form"
    on:submit|preventDefault={() => {
      onSubmit();
    }}
  >
    <RetroInput bind:value={input} placeholder="Ask TrenchClaw..." />
    <RetroButton type="submit" disabled={sending}>Send</RetroButton>
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
    line-height: 1.4;
    white-space: pre-wrap;
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

  .bubble.system {
    color: var(--tc-color-red);
    background: var(--tc-color-black);
  }

  .bubble p {
    margin: 0;
  }

  .chat-form {
    flex-shrink: 0;
    border-top: var(--tc-border-muted);
    padding: var(--tc-space-2);
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--tc-space-2);
  }

  :global(.chat-form .retro-input) {
    font-size: var(--tc-chat-text-size);
    line-height: 1.4;
  }

  :global(.chat-form .retro-input::placeholder) {
    color: var(--tc-color-turquoise);
  }
</style>
