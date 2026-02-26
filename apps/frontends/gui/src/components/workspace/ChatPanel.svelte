<script lang="ts">
  import type { UIMessage } from "ai";
  import RetroButton from "../ui/RetroButton.svelte";
  import RetroInput from "../ui/RetroInput.svelte";

  export let messages: UIMessage[] = [];
  export let input = "";
  export let sending = false;
  export let onSubmit: () => void;
</script>

<section class="chat-root">
  <header class="chat-header">Chat</header>

  <div class="chat-messages">
    {#each messages as message}
      <div class="message-row {message.role}">
        <div class="bubble {message.role}">
          {#each message.parts as part}
            {#if part.type === "text"}
              <p>{part.text}</p>
            {:else if part.type.startsWith("tool-")}
              <pre>{JSON.stringify(part, null, 2)}</pre>
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
  }

  .chat-header {
    flex-shrink: 0;
    border-bottom: var(--tc-border-muted);
    color: var(--tc-color-turquoise);
    padding: 10px 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.86rem;
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
    font-size: 0.8rem;
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

  .bubble pre {
    margin: var(--tc-space-2) 0 0 0;
    padding: var(--tc-space-2);
    border: var(--tc-border-muted);
    background: var(--tc-color-black);
    color: var(--tc-color-gray-2);
    font-size: 0.72rem;
    overflow-x: auto;
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
    font-size: 0.8rem;
    line-height: 1.4;
  }

  :global(.chat-form .retro-input::placeholder) {
    color: var(--tc-color-turquoise);
  }
</style>
