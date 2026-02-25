<script lang="ts">
  import type { GuiActivityEntry } from "@trenchclaw/types";
  import RetroPanel from "../ui/RetroPanel.svelte";

  export let entries: GuiActivityEntry[] = [];
  export let formatTime: (unixMs: number) => string;
</script>

<RetroPanel title="Summary Log">
  {#if entries.length === 0}
    <p class="empty">No confirmations yet.</p>
  {:else}
    {#each entries as entry}
      <p class="row">
        <span>{entry.source}</span>
        <small>{formatTime(entry.timestamp)}</small>
        <br />
        {entry.summary}
      </p>
    {/each}
  {/if}
</RetroPanel>

<style>
  .empty {
    margin: 0;
    color: var(--tc-color-gray-1);
    font-size: 0.82rem;
    text-transform: uppercase;
  }

  .row {
    margin: 0 0 var(--tc-space-2) 0;
    color: var(--tc-color-gray-3);
    font-size: 0.8rem;
    line-height: 1.35;
  }

  .row span {
    color: var(--tc-color-turquoise);
    text-transform: uppercase;
    font-size: 0.72rem;
    letter-spacing: 0.06em;
  }

  .row small {
    margin-left: 8px;
    color: var(--tc-color-gray-2);
    font-size: 0.7rem;
  }
</style>
