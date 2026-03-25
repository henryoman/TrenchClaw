<script lang="ts">
  import type { GuiActivityEntry } from "@trenchclaw/types";
  import type { UIMessage } from "ai";
  import RetroPanel from "../ui/RetroPanel.svelte";
  import {
    buildChatActivitySnapshot,
    buildConsoleFeedItems,
    isIdleActivityItem,
    type ChatActivityItem,
    type ChatActivityFeedItem,
    type ChatStatus,
  } from "./chatActivity";

  export let entries: GuiActivityEntry[] = [];
  export let liveMessages: UIMessage[] = [];
  export let liveChatStatus: ChatStatus = "ready";
  export let liveRuntimeError = "";
  export let formatTime: (unixMs: number) => string;

  const isLegacyRuntimeTransportInitialized = (entry: GuiActivityEntry): boolean =>
    entry.source === "runtime" && entry.summary === "Runtime transport initialized";

  const isRuntimeInitialized = (entry: ChatActivityFeedItem): boolean =>
    entry.sourceLabel === "runtime" && entry.summary.toLowerCase() === "initialized";

  const formatRuntimeInitializedAt = (unixMs: number): string =>
    new Date(unixMs).toLocaleString([], {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

  const formatLiveItem = (item: ChatActivityItem): string =>
    item.title === "Agent" || item.title === "Response" || item.title === "Runtime error"
      ? item.detail
      : `${item.title}: ${item.detail}`;

  let filteredEntries: GuiActivityEntry[] = [];
  let consoleEntries: ChatActivityFeedItem[] = [];
  let liveSnapshot = buildChatActivitySnapshot({
    messages: liveMessages,
    chatStatus: liveChatStatus,
    runtimeError: liveRuntimeError,
    runtimeEntries: entries,
  });
  let liveItems = liveSnapshot.currentItems.filter((item) => !isIdleActivityItem(item));

  $: filteredEntries = entries.filter((entry) => !isLegacyRuntimeTransportInitialized(entry));
  $: consoleEntries = buildConsoleFeedItems(filteredEntries);
  $: liveSnapshot = buildChatActivitySnapshot({
    messages: liveMessages,
    chatStatus: liveChatStatus,
    runtimeError: liveRuntimeError,
    runtimeEntries: entries,
  });
  $: liveItems = liveSnapshot.currentItems.filter((item) => !isIdleActivityItem(item));
</script>

<RetroPanel title="Console">
  {#if liveItems.length === 0 && consoleEntries.length === 0}
    <p class="empty tc-console-copy">No confirmations yet.</p>
  {:else}
    {#each liveItems as item (item.id)}
      <p class={`row row-live tone-${item.tone}`}>
        <span class="source">agent</span>
        <span class="live-copy">
          <span class="tc-console-copy copy">{formatLiveItem(item)}</span>
          {#if item.meta}
            <small class="tc-console-copy meta">{item.meta}</small>
          {/if}
        </span>
      </p>
    {/each}

    {#each consoleEntries as entry}
      <p class="row row-feed">
        <span class="source">{entry.sourceLabel}</span>
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
    grid-template-columns: auto minmax(0, 1fr);
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

  .row-feed {
    grid-template-columns: auto auto minmax(0, 1fr);
  }

  .row-live.tone-pending .source,
  .row-live.tone-running .source {
    color: var(--tc-color-turquoise);
  }

  .row-live.tone-queued .source {
    color: var(--tc-color-lime);
  }

  .row-live.tone-error .source {
    color: var(--tc-color-red);
  }
</style>
