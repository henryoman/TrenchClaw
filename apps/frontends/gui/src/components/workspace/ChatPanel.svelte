<script lang="ts">
  import RetroButton from "../ui/RetroButton.svelte";
  import RetroInput from "../ui/RetroInput.svelte";
  import RetroPanel from "../ui/RetroPanel.svelte";

  export interface ChatRow {
    role: "assistant" | "user" | "system";
    text: string;
    timestamp: number;
  }

  export let rows: ChatRow[] = [];
  export let input = "";
  export let sending = false;
  export let formatTime: (unixMs: number) => string;
  export let onSubmit: () => void;
</script>

<RetroPanel title="Chat">
  <div class="chat-wrap">
    {#each rows as row}
      <p class={`row ${row.role}`}>
        <span>{row.role === "assistant" ? "TrenchClaw" : row.role === "user" ? "You" : "System"}</span>
        <small>{formatTime(row.timestamp)}</small>
        <br />
        {row.text}
      </p>
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
</RetroPanel>

<style>
  .chat-wrap {
    border: var(--tc-border-muted);
    min-height: 0;
    overflow: auto;
    padding: var(--tc-space-2);
    background: #07050d;
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
    color: #9b7cf2;
  }

  .row.system span {
    color: var(--tc-color-red);
  }

  .row small {
    margin-left: 8px;
    color: var(--tc-color-gray-2);
    font-size: 0.7rem;
  }

  .chat-form {
    margin-top: var(--tc-space-2);
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--tc-space-2);
  }
</style>
