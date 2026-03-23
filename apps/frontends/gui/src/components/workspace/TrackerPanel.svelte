<script lang="ts">
  import type { GuiTrackedTokenView, GuiTrackedWalletView, GuiTrackerView } from "@trenchclaw/types";

  type TrackerPanelProps = {
    filePath?: string;
    runtimePath?: string;
    tracker?: GuiTrackerView | null;
    busy?: boolean;
    error?: string;
    onReload: () => void;
    onSave: (tracker: GuiTrackerView) => void;
  };

  const createEmptyWallet = (): GuiTrackedWalletView => ({
    address: "",
    label: "",
    notes: "",
    tags: [],
    enabled: true,
  });

  const createEmptyToken = (): GuiTrackedTokenView => ({
    mintAddress: "",
    symbol: "",
    label: "",
    notes: "",
    tags: [],
    enabled: true,
  });

  const createEmptyTracker = (): GuiTrackerView => ({
    version: 1,
    trackedWallets: [],
    trackedTokens: [],
  });

  const cloneTracker = (value: GuiTrackerView | null | undefined): GuiTrackerView => ({
    version: 1,
    trackedWallets: (value?.trackedWallets ?? []).map((wallet) => ({
      address: wallet.address,
      label: wallet.label,
      notes: wallet.notes,
      tags: [...wallet.tags],
      enabled: wallet.enabled,
    })),
    trackedTokens: (value?.trackedTokens ?? []).map((token) => ({
      mintAddress: token.mintAddress,
      symbol: token.symbol,
      label: token.label,
      notes: token.notes,
      tags: [...token.tags],
      enabled: token.enabled,
    })),
  });

  const parseTags = (value: string): string[] =>
    Array.from(
      new Set(
        value
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    );

  const normalizeTracker = (value: GuiTrackerView): GuiTrackerView => ({
    version: 1,
    trackedWallets: value.trackedWallets.map((wallet) => ({
      address: wallet.address.trim(),
      label: wallet.label.trim(),
      notes: wallet.notes.trim(),
      tags: parseTags(wallet.tags.join(",")),
      enabled: wallet.enabled,
    })),
    trackedTokens: value.trackedTokens.map((token) => ({
      mintAddress: token.mintAddress.trim(),
      symbol: token.symbol.trim().toUpperCase(),
      label: token.label.trim(),
      notes: token.notes.trim(),
      tags: parseTags(token.tags.join(",")),
      enabled: token.enabled,
    })),
  });

  let {
    filePath = "",
    runtimePath = "",
    tracker = null,
    busy = false,
    error = "",
    onReload,
    onSave,
  }: TrackerPanelProps = $props();

  let draft = $state<GuiTrackerView>(createEmptyTracker());

  $effect(() => {
    draft = cloneTracker(tracker);
  });

  const addWallet = (): void => {
    draft.trackedWallets.push(createEmptyWallet());
  };

  const removeWallet = (index: number): void => {
    draft.trackedWallets.splice(index, 1);
  };

  const addToken = (): void => {
    draft.trackedTokens.push(createEmptyToken());
  };

  const removeToken = (index: number): void => {
    draft.trackedTokens.splice(index, 1);
  };

  const updateWalletTags = (index: number, value: string): void => {
    draft.trackedWallets[index].tags = parseTags(value);
  };

  const updateTokenTags = (index: number, value: string): void => {
    draft.trackedTokens[index].tags = parseTags(value);
  };

  const canSave = $derived.by(() =>
    !busy
    && draft.trackedWallets.every((wallet) => wallet.address.trim().length > 0)
    && draft.trackedTokens.every((token) => token.mintAddress.trim().length > 0));

  const saveDraft = (): void => {
    if (!canSave) {
      return;
    }
    onSave(normalizeTracker(draft));
  };
</script>

<section class="tracker-panel">
  <header class="tracker-header">
    <div>
      <h2>Tracker</h2>
      <p class="path">{runtimePath || filePath || "workspace/configs/tracker.json"}</p>
      <p class="hint">Tracked wallets and tokens here are available to the model through the instance workspace.</p>
    </div>
    <div class="header-actions">
      <button type="button" class="reload-button" onclick={onReload} disabled={busy}>
        {busy ? "Loading..." : "Reload"}
      </button>
      <button type="button" class="save-button" onclick={saveDraft} disabled={!canSave}>
        {busy ? "Working..." : "Save"}
      </button>
    </div>
  </header>

  {#if error}
    <p class="status error">{error}</p>
  {/if}

  <div class="tracker-grid">
    <section class="tracker-section">
      <div class="section-header">
        <div>
          <h3>Tracked wallets</h3>
          <p>Use these for watchlists, smart-money checks, and copy-trade research.</p>
        </div>
        <button type="button" class="ghost-button" onclick={addWallet}>Add wallet</button>
      </div>

      {#if draft.trackedWallets.length === 0}
        <p class="empty-state">No tracked wallets yet.</p>
      {:else}
        <div class="entry-list">
          {#each draft.trackedWallets as wallet, index}
            <article class="entry-card">
              <div class="entry-head">
                <label class="toggle">
                  <input type="checkbox" bind:checked={draft.trackedWallets[index].enabled} />
                  <span>Enabled</span>
                </label>
                <button type="button" class="remove-button" onclick={() => removeWallet(index)}>Remove</button>
              </div>

              <label class="field">
                <span>Address</span>
                <input bind:value={draft.trackedWallets[index].address} placeholder="Base58 wallet address" spellcheck="false" />
              </label>

              <div class="field-row">
                <label class="field">
                  <span>Label</span>
                  <input bind:value={draft.trackedWallets[index].label} placeholder="Smart wallet 1" />
                </label>

                <label class="field">
                  <span>Tags</span>
                  <input
                    value={wallet.tags.join(", ")}
                    placeholder="smart-money, whales"
                    oninput={(event) => {
                      updateWalletTags(index, event.currentTarget.value);
                    }}
                  />
                </label>
              </div>

              <label class="field">
                <span>Notes</span>
                <textarea bind:value={draft.trackedWallets[index].notes} rows="3" placeholder="Why this wallet matters"></textarea>
              </label>
            </article>
          {/each}
        </div>
      {/if}
    </section>

    <section class="tracker-section">
      <div class="section-header">
        <div>
          <h3>Tracked tokens</h3>
          <p>Use these for targeted mint monitoring, market checks, and wallet overlap analysis.</p>
        </div>
        <button type="button" class="ghost-button" onclick={addToken}>Add token</button>
      </div>

      {#if draft.trackedTokens.length === 0}
        <p class="empty-state">No tracked tokens yet.</p>
      {:else}
        <div class="entry-list">
          {#each draft.trackedTokens as token, index}
            <article class="entry-card">
              <div class="entry-head">
                <label class="toggle">
                  <input type="checkbox" bind:checked={draft.trackedTokens[index].enabled} />
                  <span>Enabled</span>
                </label>
                <button type="button" class="remove-button" onclick={() => removeToken(index)}>Remove</button>
              </div>

              <label class="field">
                <span>Mint</span>
                <input bind:value={draft.trackedTokens[index].mintAddress} placeholder="SPL mint address" spellcheck="false" />
              </label>

              <div class="field-row">
                <label class="field">
                  <span>Symbol</span>
                  <input bind:value={draft.trackedTokens[index].symbol} placeholder="JUP" spellcheck="false" />
                </label>

                <label class="field">
                  <span>Label</span>
                  <input bind:value={draft.trackedTokens[index].label} placeholder="Jupiter" />
                </label>
              </div>

              <div class="field-row">
                <label class="field">
                  <span>Tags</span>
                  <input
                    value={token.tags.join(", ")}
                    placeholder="watchlist, copy-trade"
                    oninput={(event) => {
                      updateTokenTags(index, event.currentTarget.value);
                    }}
                  />
                </label>
              </div>

              <label class="field">
                <span>Notes</span>
                <textarea bind:value={draft.trackedTokens[index].notes} rows="3" placeholder="What to watch for"></textarea>
              </label>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</section>

<style>
  .tracker-panel {
    border: var(--tc-border);
    background: var(--tc-color-black-2);
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tracker-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--tc-space-3);
    padding: var(--tc-space-3);
    border-bottom: var(--tc-border-muted);
  }

  .tracker-header h2,
  .tracker-section h3 {
    margin: 0;
    color: var(--tc-color-gray-1);
    text-transform: uppercase;
    letter-spacing: var(--tc-sidebar-letter-spacing);
  }

  .tracker-header h2 {
    font-size: 0.9rem;
  }

  .path,
  .hint,
  .tracker-section p {
    margin: 0.35rem 0 0;
    color: var(--tc-color-gray-3);
    font-size: 0.68rem;
    line-height: 1.4;
    text-transform: none;
  }

  .path {
    word-break: break-all;
  }

  .header-actions,
  .section-header {
    display: flex;
    gap: var(--tc-space-2);
  }

  .header-actions {
    align-items: center;
  }

  .section-header {
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: var(--tc-space-3);
  }

  .reload-button,
  .save-button,
  .ghost-button,
  .remove-button {
    border: var(--tc-border-muted);
    background: transparent;
    font-family: inherit;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: var(--tc-sidebar-letter-spacing);
    padding: 0.35rem 0.55rem;
    cursor: pointer;
  }

  .reload-button,
  .ghost-button {
    color: var(--tc-color-turquoise);
  }

  .save-button {
    color: var(--tc-color-lime);
  }

  .remove-button {
    color: var(--tc-color-red);
  }

  .reload-button:disabled,
  .save-button:disabled,
  .ghost-button:disabled,
  .remove-button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .status {
    margin: 0;
    padding: 0 var(--tc-space-3) var(--tc-space-3);
    color: var(--tc-color-gray-1);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: var(--tc-sidebar-letter-spacing);
  }

  .status.error {
    color: var(--tc-color-red);
  }

  .tracker-grid {
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--tc-space-3);
    padding: var(--tc-space-3);
    overflow: auto;
  }

  .tracker-section {
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .entry-list {
    display: flex;
    flex-direction: column;
    gap: var(--tc-space-2);
  }

  .entry-card {
    border: var(--tc-border-muted);
    background: color-mix(in srgb, var(--tc-color-black-2) 85%, var(--tc-color-black));
    padding: var(--tc-space-2);
    display: flex;
    flex-direction: column;
    gap: var(--tc-space-2);
  }

  .entry-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--tc-space-2);
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--tc-color-gray-2);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: var(--tc-sidebar-letter-spacing);
  }

  .field-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--tc-space-2);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .field span {
    color: var(--tc-color-gray-2);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: var(--tc-sidebar-letter-spacing);
  }

  .field input,
  .field textarea {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: var(--tc-border-muted);
    background: var(--tc-color-black);
    color: var(--tc-color-gray-1);
    font: inherit;
    padding: 0.5rem 0.6rem;
  }

  .field textarea {
    resize: vertical;
  }

  .empty-state {
    margin-top: 0;
    color: var(--tc-color-gray-2);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: var(--tc-sidebar-letter-spacing);
  }

  @media (max-width: 1180px) {
    .tracker-grid,
    .field-row {
      grid-template-columns: 1fr;
    }
  }
</style>
