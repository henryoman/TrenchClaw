<script lang="ts">
  import type { GuiActivityEntry } from "@trenchclaw/types";
  import RetroPanel from "../ui/RetroPanel.svelte";

  export let entries: GuiActivityEntry[] = [];
  export let formatTime: (unixMs: number) => string;

  const isLegacyRuntimeTransportInitialized = (entry: GuiActivityEntry): boolean =>
    entry.source === "runtime" && entry.summary === "Runtime transport initialized";

  const isRuntimeInitialized = (entry: GuiActivityEntry): boolean =>
    entry.source === "runtime" && entry.summary === "Initialized";

  const formatRuntimeInitializedAt = (unixMs: number): string =>
    new Date(unixMs).toLocaleString([], {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
</script>

<RetroPanel title="Console">
  {#if entries.length === 0}
    <p class="empty tc-console-copy">No confirmations yet.</p>
  {:else}
    {#each entries.filter((entry) => !isLegacyRuntimeTransportInitialized(entry)) as entry}
      <p class="row">
        <span class="source">{entry.source}</span>
        {#if isRuntimeInitialized(entry)}
          <span class="tc-console-copy copy">
            {entry.summary} at {formatRuntimeInitializedAt(entry.timestamp)}
          </span>
        {:else}
          <small>{formatTime(entry.timestamp)}</small>
          <span class="tc-console-copy copy">{entry.summary}</span>
        {/if}
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
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: baseline;
    column-gap: var(--tc-space-1);
    font-size: var(--tc-console-text-size);
    line-height: var(--tc-console-line-height);
  }

  .source {
    color: var(--tc-color-turquoise);
    text-transform: uppercase;
    font-size: inherit;
    letter-spacing: var(--tc-track-wide);
  }

  .row small {
    color: var(--tc-color-gray-2);
    font-size: inherit;
  }

  .copy {
    color: var(--tc-console-text-color);
    text-transform: none;
    letter-spacing: normal;
    min-width: 0;
  }
</style>
