<script lang="ts">
  import type { GuiWalletNodeView } from "@trenchclaw/types";
  import { onDestroy } from "svelte";
  import { runtimeApi } from "../../runtime-api";

  export let node: GuiWalletNodeView;
  export let depth = 0;

  $: indentPx = depth * 14;
  $: isFile = node.kind === "file";
  $: displayName = isFile ? node.displayName ?? node.walletName ?? node.name.replace(/\.json$/i, "") : node.name;
  $: shortAddress = node.address ? `${node.address.slice(0, 4)}...${node.address.slice(-4)}` : "";

  let expanded = false;
  let copyFeedback = "";
  let copyFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;

  const clearCopyFeedback = () => {
    if (copyFeedbackTimeout) {
      clearTimeout(copyFeedbackTimeout);
      copyFeedbackTimeout = null;
    }
    copyFeedback = "";
  };

  const setCopyFeedback = (message: string) => {
    clearCopyFeedback();
    copyFeedback = message;
    copyFeedbackTimeout = setTimeout(() => {
      copyFeedback = "";
      copyFeedbackTimeout = null;
    }, 1600);
  };

  const toggleExpanded = () => {
    if (!isFile) {
      return;
    }
    expanded = !expanded;
  };

  const onRowKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    toggleExpanded();
  };

  const copyAddress = async () => {
    if (!node.address) {
      setCopyFeedback("No address");
      return;
    }
    try {
      await navigator.clipboard.writeText(node.address);
      setCopyFeedback("Copied");
    } catch {
      setCopyFeedback("Copy failed");
    }
  };

  onDestroy(() => {
    clearCopyFeedback();
  });
</script>

<li class="wallet-node">
  {#if isFile}
    <div
      class:file-row-expanded={expanded}
      class="wallet-row wallet-row-button"
      style={`--tc-wallet-indent: ${indentPx}px`}
      on:click={toggleExpanded}
      on:keydown={onRowKeydown}
      role="button"
      tabindex="0"
      aria-expanded={expanded}
    >
      <span class="icon" aria-hidden="true">🔑</span>
      <span class="wallet-copy">
        <span class="name">{displayName}</span>
        {#if shortAddress}
          <span class="address-preview">{shortAddress}</span>
        {/if}
      </span>
      <span class="actions">
        <button
          type="button"
          class="icon-button"
          aria-label={node.address ? `Copy address for ${displayName}` : `No address available for ${displayName}`}
          title={node.address ? "Copy address" : "No address available"}
          on:click|stopPropagation={copyAddress}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="5" y="3" width="8" height="10" rx="1.5"></rect>
            <rect x="3" y="5" width="8" height="10" rx="1.5"></rect>
          </svg>
        </button>
        <a
          class="backup-link"
          href={runtimeApi.walletBackupDownloadUrl(node.relativePath)}
          download={node.name}
          on:click|stopPropagation
        >
          Backup
        </a>
      </span>
    </div>
    {#if expanded}
      <div class="wallet-details" style={`--tc-wallet-indent: ${indentPx}px`}>
        {#if node.address}
          <div class="detail-block">
            <span class="detail-label">Address</span>
            <code class="detail-value">{node.address}</code>
          </div>
        {/if}
      </div>
    {/if}
  {:else}
    <div class="wallet-row" style={`--tc-wallet-indent: ${indentPx}px`}>
      <span class="icon" aria-hidden="true">📁</span>
      <span class="name">{node.name}</span>
    </div>
  {/if}
  {#if copyFeedback}
    <div class="copy-feedback" style={`--tc-wallet-indent: ${indentPx}px`}>{copyFeedback}</div>
  {/if}

  {#if node.kind === "directory" && node.children && node.children.length > 0}
    <ul class="wallet-tree">
      {#each node.children as child (child.relativePath)}
        <svelte:self node={child} depth={depth + 1} />
      {/each}
    </ul>
  {/if}
</li>

<style>
  .wallet-tree {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .wallet-node {
    margin: 0;
    padding: 0;
  }

  .wallet-row {
    min-height: 2rem;
    display: flex;
    align-items: center;
    gap: var(--tc-space-2);
    border-bottom: var(--tc-border-muted);
    padding-left: calc(var(--tc-panel-content-padding) + var(--tc-wallet-indent, 0px));
    padding-right: var(--tc-panel-content-padding);
    padding-top: 0.3rem;
    padding-bottom: 0.3rem;
    box-sizing: border-box;
  }

  .wallet-row-button {
    width: 100%;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .wallet-row-button:hover,
  .file-row-expanded {
    background: rgba(255, 255, 255, 0.03);
  }

  .icon {
    width: 1.2rem;
    text-align: center;
    flex: 0 0 auto;
  }

  .wallet-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.12rem;
    flex: 1 1 auto;
  }

  .name {
    color: var(--tc-color-gray-1);
    font-size: 0.8rem;
    letter-spacing: 0.04em;
    text-transform: none;
    word-break: break-word;
  }

  .address-preview {
    color: var(--tc-color-gray-3);
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    text-transform: none;
  }

  .actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex: 0 0 auto;
  }

  .icon-button {
    width: 1.8rem;
    height: 1.8rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: var(--tc-border-muted);
    background: transparent;
    color: var(--tc-color-turquoise);
    cursor: pointer;
    padding: 0;
  }

  .icon-button svg {
    width: 0.85rem;
    height: 0.85rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
  }

  .icon-button:hover,
  .backup-link:hover {
    border-color: var(--tc-color-turquoise);
  }

  .backup-link {
    border: var(--tc-border-muted);
    color: var(--tc-color-turquoise);
    text-decoration: none;
    text-transform: uppercase;
    letter-spacing: var(--tc-sidebar-letter-spacing);
    font-size: 0.68rem;
    padding: 0.2rem 0.45rem;
  }

  .wallet-details,
  .copy-feedback {
    padding-left: calc(var(--tc-panel-content-padding) + var(--tc-wallet-indent, 0px) + 1.9rem);
    padding-right: var(--tc-panel-content-padding);
    padding-bottom: 0.6rem;
  }

  .wallet-details {
    border-bottom: var(--tc-border-muted);
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .detail-block {
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
  }

  .detail-label {
    color: var(--tc-color-gray-3);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: var(--tc-sidebar-letter-spacing);
  }

  .detail-value {
    color: var(--tc-color-gray-1);
    font-size: 0.72rem;
    word-break: break-all;
    white-space: normal;
  }

  .copy-feedback {
    color: var(--tc-color-turquoise);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: var(--tc-sidebar-letter-spacing);
  }
</style>
