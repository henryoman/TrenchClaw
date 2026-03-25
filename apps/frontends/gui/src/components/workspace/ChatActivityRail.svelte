<script lang="ts">
  import type { GuiActivityEntry } from "@trenchclaw/types";
  import type { UIMessage } from "ai";
  import { buildChatActivitySnapshot, type ChatStatus } from "./chatActivity";

  type ChatActivityRailProps = {
    messages?: UIMessage[];
    chatStatus?: ChatStatus;
    runtimeError?: string;
    runtimeEntries?: GuiActivityEntry[];
  };

  let {
    messages = [],
    chatStatus = "ready",
    runtimeError = "",
    runtimeEntries = [],
  }: ChatActivityRailProps = $props();

  const snapshot = $derived(buildChatActivitySnapshot({
    messages,
    chatStatus,
    runtimeError,
    runtimeEntries,
  }));

  const formatRuntimeTime = (unixMs: number): string =>
    new Date(unixMs).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
</script>

<aside class="activity-rail">
  <header class="activity-header">
    <div class="activity-heading">
      <p class="activity-kicker">Live Agent Activity</p>
      <h3>Current run and runtime feed</h3>
    </div>
    <span class={`status-pill tone-${snapshot.statusTone}`}>{snapshot.statusLabel}</span>
  </header>

  <div class="activity-scroll">
    <section class="activity-section">
      <div class="section-head">
        <span>Current run</span>
        <small>{snapshot.currentItems.length} item{snapshot.currentItems.length === 1 ? "" : "s"}</small>
      </div>

      <div class="current-list">
        {#each snapshot.currentItems as item (item.id)}
          <article class={`activity-card tone-${item.tone}`}>
            <div class="card-head">
              <span class="card-badge">{item.badge}</span>
              <h4>{item.title}</h4>
            </div>
            <p class="card-detail">{item.detail}</p>
            {#if item.meta}
              <small class="card-meta">{item.meta}</small>
            {/if}
          </article>
        {/each}
      </div>
    </section>

    <section class="activity-section">
      <div class="section-head">
        <span>Runtime feed</span>
        <small>latest {snapshot.feedItems.length}</small>
      </div>

      {#if snapshot.feedItems.length === 0}
        <p class="feed-empty">No runtime feed entries yet.</p>
      {:else}
        <div class="feed-list">
          {#each snapshot.feedItems as entry (entry.id)}
            <article class={`feed-row tone-${entry.tone}`}>
              <div class="feed-meta">
                <span class="feed-source">{entry.sourceLabel}</span>
                <small>{formatRuntimeTime(entry.timestamp)}</small>
              </div>
              <p>{entry.summary}</p>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</aside>

<style>
  .activity-rail {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    border-left: var(--tc-border-muted);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--tc-color-lime) 5%, transparent), transparent 18%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.025) 0, rgba(255, 255, 255, 0.025) 1px, transparent 1px, transparent 22px),
      var(--tc-color-black);
  }

  .activity-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--tc-space-2);
    padding: var(--tc-space-3);
    border-bottom: var(--tc-border-muted);
  }

  .activity-heading {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .activity-kicker {
    margin: 0;
    color: var(--tc-color-gray-2);
    font-size: var(--tc-type-xs);
    text-transform: uppercase;
    letter-spacing: var(--tc-track-wide);
  }

  .activity-heading h3 {
    margin: 0;
    color: var(--tc-color-cream);
    font-size: var(--tc-type-sm);
    line-height: 1.35;
    font-weight: 500;
  }

  .status-pill {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 74px;
    padding: 6px 10px;
    border: var(--tc-border-muted);
    font-size: var(--tc-type-xs);
    text-transform: uppercase;
    letter-spacing: var(--tc-track-wide);
    color: var(--tc-color-cream);
    background: color-mix(in srgb, var(--tc-color-gray-2) 28%, transparent);
  }

  .activity-scroll {
    min-height: 0;
    overflow: auto;
    display: grid;
    gap: var(--tc-space-4);
    padding: var(--tc-space-3);
  }

  .activity-section {
    display: grid;
    gap: var(--tc-space-2);
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--tc-space-2);
    color: var(--tc-color-gray-2);
    font-size: var(--tc-type-xs);
    text-transform: uppercase;
    letter-spacing: var(--tc-track-wide);
  }

  .section-head small {
    color: var(--tc-color-gray-2);
    font-size: inherit;
    letter-spacing: normal;
    text-transform: none;
  }

  .current-list,
  .feed-list {
    display: grid;
    gap: var(--tc-space-2);
  }

  .activity-card,
  .feed-row {
    display: grid;
    gap: 6px;
    padding: var(--tc-space-2);
    border: var(--tc-border-muted);
    background: color-mix(in srgb, var(--tc-color-black-light) 88%, transparent);
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .card-badge {
    flex-shrink: 0;
    min-width: 3.6rem;
    padding: 2px 6px;
    border: var(--tc-border-muted);
    color: var(--tc-color-gray-3);
    font-size: 10px;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: var(--tc-track-wide);
  }

  .card-head h4 {
    margin: 0;
    min-width: 0;
    color: var(--tc-color-cream);
    font-size: var(--tc-type-sm);
    font-weight: 500;
    line-height: 1.3;
  }

  .card-detail,
  .feed-row p {
    margin: 0;
    color: var(--tc-color-gray-3);
    font-size: 0.78rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .card-meta,
  .feed-meta small {
    color: var(--tc-color-gray-2);
    font-size: 10px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .feed-meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--tc-space-2);
  }

  .feed-source {
    color: var(--tc-color-turquoise);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: var(--tc-track-wide);
  }

  .feed-empty {
    margin: 0;
    color: var(--tc-color-gray-2);
    font-size: 0.74rem;
    line-height: 1.45;
  }

  .tone-pending {
    border-color: color-mix(in srgb, var(--tc-color-gray-3) 25%, var(--tc-color-border));
  }

  .tone-running {
    border-color: color-mix(in srgb, var(--tc-color-turquoise) 38%, var(--tc-color-border));
    background: color-mix(in srgb, var(--tc-color-turquoise) 6%, var(--tc-color-black-light));
  }

  .tone-queued {
    border-color: color-mix(in srgb, var(--tc-color-lime) 38%, var(--tc-color-border));
    background: color-mix(in srgb, var(--tc-color-lime) 7%, var(--tc-color-black-light));
  }

  .tone-done {
    border-color: color-mix(in srgb, var(--tc-color-gray-3) 34%, var(--tc-color-border));
  }

  .tone-error {
    border-color: color-mix(in srgb, var(--tc-color-red) 46%, var(--tc-color-border));
    background: color-mix(in srgb, var(--tc-color-red) 8%, var(--tc-color-black-light));
  }

  .tone-running .card-badge,
  .tone-running.status-pill {
    color: var(--tc-color-turquoise);
  }

  .tone-queued .card-badge,
  .tone-queued.status-pill {
    color: var(--tc-color-lime);
  }

  .tone-error .card-badge,
  .tone-error.status-pill {
    color: var(--tc-color-red);
  }

  .tone-done .card-badge,
  .tone-done.status-pill {
    color: var(--tc-color-cream);
  }

  @media (max-width: 1080px) {
    .activity-rail {
      border-left: 0;
      border-top: var(--tc-border-muted);
      max-height: 280px;
    }
  }
</style>
