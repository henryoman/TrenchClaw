<script lang="ts">
  import type { GuiActivityEntry } from "@trenchclaw/types";
  import type { UIMessage } from "ai";
  import RetroPanel from "../ui/RetroPanel.svelte";
  import { buildChatActivitySnapshot, isIdleActivityItem, type ChatStatus } from "./chat-activity";

  export let entries: GuiActivityEntry[] = [];
  export let liveMessages: UIMessage[] = [];
  export let liveChatStatus: ChatStatus = "ready";
  export let liveRuntimeError = "";
  export let formatTime: (unixMs: number) => string;

  const isLegacyRuntimeTransportInitialized = (entry: GuiActivityEntry): boolean =>
    entry.source === "runtime" && entry.summary === "Runtime transport initialized";

  const isRuntimeInitialized = (entry: GuiActivityEntry): boolean =>
    entry.source === "runtime" && entry.summary.toLowerCase() === "initialized";

  const formatRuntimeInitializedAt = (unixMs: number): string =>
    new Date(unixMs).toLocaleString([], {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

  let filteredEntries: GuiActivityEntry[] = [];
  let liveSnapshot = buildChatActivitySnapshot({
    messages: liveMessages,
    chatStatus: liveChatStatus,
    runtimeError: liveRuntimeError,
    runtimeEntries: entries,
  });
  let liveItems = liveSnapshot.currentItems.filter((item) => !isIdleActivityItem(item));

  $: filteredEntries = entries.filter((entry) => !isLegacyRuntimeTransportInitialized(entry));
  $: liveSnapshot = buildChatActivitySnapshot({
    messages: liveMessages,
    chatStatus: liveChatStatus,
    runtimeError: liveRuntimeError,
    runtimeEntries: entries,
  });
  $: liveItems = liveSnapshot.currentItems.filter((item) => !isIdleActivityItem(item));
</script>

<RetroPanel title="Console">
  {#if liveItems.length === 0 && filteredEntries.length === 0}
    <p class="empty tc-console-copy">No confirmations yet.</p>
  {:else}
    {#each liveItems as item (item.id)}
      <p class={`row row-live tone-${item.tone}`}>
        <span class="source">agent</span>
        <small class="badge">{item.badge}</small>
        <span class="live-copy">
          <span class="tc-console-copy copy">{item.title}: {item.detail}</span>
          {#if item.meta}
            <small class="tc-console-copy meta">{item.meta}</small>
          {/if}
        </span>
      </p>
    {/each}

    {#each filteredEntries as entry}
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

  .row-live {
    align-items: start;
  }

  .badge {
    display: inline-flex;
    min-width: 3.2rem;
    justify-content: center;
    border: var(--tc-border-muted);
    padding: 1px 4px;
    color: var(--tc-color-gray-3);
    font-size: 0.6rem;
    letter-spacing: var(--tc-track-wide);
    text-transform: uppercase;
  }

  .live-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .copy {
    color: var(--tc-console-text-color);
    text-transform: none;
    letter-spacing: normal;
    min-width: 0;
  }

  .meta {
    color: var(--tc-color-gray-2);
    font-size: 0.64rem;
    line-height: 1.35;
    text-transform: none;
    letter-spacing: normal;
    overflow-wrap: anywhere;
  }

  .row-live.tone-pending .badge,
  .row-live.tone-running .badge {
    border-color: color-mix(in srgb, var(--tc-color-turquoise) 42%, var(--tc-color-gray-2));
    color: var(--tc-color-turquoise);
  }

  .row-live.tone-queued .badge {
    border-color: color-mix(in srgb, var(--tc-color-lime) 45%, var(--tc-color-gray-2));
    color: var(--tc-color-lime);
  }

  .row-live.tone-done .badge {
    color: var(--tc-color-cream);
  }

  .row-live.tone-error .badge {
    border-color: color-mix(in srgb, var(--tc-color-red) 56%, var(--tc-color-gray-2));
    color: var(--tc-color-red);
  }
</style>
