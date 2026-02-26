<script lang="ts">
  import type { UIMessage } from "ai";
  import RetroButton from "../ui/RetroButton.svelte";
  import RetroInput from "../ui/RetroInput.svelte";
  import RetroPanel from "../ui/RetroPanel.svelte";

  export let messages: UIMessage[] = [];
  export let input = "";
  export let sending = false;
  export let onSubmit: () => void;
</script>

<RetroPanel title="Chat">
  <div class="chat-panel">
    <div class="chat-wrap">
      {#if messages.length === 0}
        <p class="hint">Console linked. Ask for actions, then verify queue and confirmations in the right panels.</p>
      {/if}

      {#each messages as message}
        <div class={`row ${message.role}`}>
          <span>{message.role === "assistant" ? "TrenchClaw" : message.role === "user" ? "You" : "System"}</span>
          <br />
          {#each message.parts as part}
            {#if part.type === "text"}
              <span>{part.text}</span>
            {:else if part.type.startsWith("tool-")}
              <pre>{JSON.stringify(part, null, 2)}</pre>
            {/if}
          {/each}
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
  </div>
</RetroPanel>

<style>
  .chat-panel {
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }

  .chat-wrap {
    border: var(--tc-border-muted);
    min-height: 0;
    flex: 1;
    overflow: auto;
    padding: var(--tc-space-2);
    background: var(--tc-color-black);
  }

  .hint {
    margin: 0 0 var(--tc-space-2) 0;
    color: var(--tc-color-gray-2);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .row {
    margin: 0 0 var(--tc-space-2) 0;
    color: var(--tc-color-gray-3);
    font-size: 0.82rem;
    line-height: 1.35;
    white-space: pre-wrap;
  }

  .row span {
    color: var(--tc-color-turquoise);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.72rem;
  }

  .row.user span {
    color: var(--tc-color-gray-3);
  }

  .row.system span {
    color: var(--tc-color-red);
  }

  .row pre {
    margin: 0;
    padding: var(--tc-space-2);
    border: var(--tc-border-muted);
    background: var(--tc-color-black);
    color: var(--tc-color-gray-2);
    font-size: 0.72rem;
    overflow-x: auto;
  }

  .chat-form {
    margin-top: var(--tc-space-2);
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--tc-space-2);
  }

  :global(.chat-form .retro-input) {
    font-size: 0.8rem;
    line-height: 1.4;
  }
</style>
