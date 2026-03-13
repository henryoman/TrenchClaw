<script lang="ts">
  import type { GuiActivityEntry } from "@trenchclaw/types";
  import RetroPanel from "../ui/RetroPanel.svelte";

  export let entries: GuiActivityEntry[] = [];
  export let formatTime: (unixMs: number) => string;
</script>

<RetroPanel title="Console">
  {#if entries.length === 0}
    <p class="empty tc-console-copy">No confirmations yet.</p>
  {:else}
    {#each entries as entry}
      <p class="row">
        <span class="source">{entry.source}</span>
        <small>{formatTime(entry.timestamp)}</small>
        <br />
        <span class="tc-console-copy copy">{entry.summary}</span>
      </p>
    {/each}
  {/if}
</RetroPanel>

<style>
  .empty {
    margin: 0;
  }

  .row {
    margin: 0 0 var(--tc-space-2) 0;
  }

  .source {
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

  .copy {
    display: inline;
    color: var(--tc-console-text-color);
    text-transform: none;
    letter-spacing: normal;
  }
</style>
