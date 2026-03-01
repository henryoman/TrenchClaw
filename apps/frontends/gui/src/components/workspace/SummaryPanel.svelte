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
    font-size: var(--tc-type-sm);
    text-transform: uppercase;
  }

  .row {
    margin: 0 0 var(--tc-space-2) 0;
    color: var(--tc-color-gray-3);
    font-size: var(--tc-type-sm);
    line-height: 1.35;
  }

  .row span {
    color: var(--tc-color-turquoise);
    text-transform: uppercase;
    font-size: var(--tc-type-xs);
    letter-spacing: var(--tc-track-wide);
  }

  .row small {
    margin-left: var(--tc-space-2);
    color: var(--tc-color-gray-2);
    font-size: var(--tc-type-xs);
  }
</style>
