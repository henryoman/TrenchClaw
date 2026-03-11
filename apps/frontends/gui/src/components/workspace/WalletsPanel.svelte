<script lang="ts">
  import type { GuiWalletNodeView } from "@trenchclaw/types";
  import WalletTreeNode from "./WalletTreeNode.svelte";

  export let rootRelativePath = "";
  export let rootExists = false;
  export let nodes: GuiWalletNodeView[] = [];
  export let walletFileCount = 0;
  export let busy = false;
  export let error = "";
  export let onReload: () => void;
</script>

<section class="wallets-panel">
  <header class="wallets-header">
    <div>
      <h2>Wallets</h2>
      <p class="path">{rootRelativePath || "src/ai/brain/protected/keypairs"}</p>
    </div>
    <button type="button" class="reload-button" on:click={onReload} disabled={busy}>
      {busy ? "Loading..." : "Reload"}
    </button>
  </header>

  {#if error}
    <p class="status error">{error}</p>
  {:else if !rootExists}
    <p class="status">Wallet folder does not exist yet.</p>
  {:else if nodes.length === 0}
    <p class="status">No folders or wallet files yet.</p>
  {:else}
    {#if walletFileCount === 0}
      <p class="status">No wallet files yet. Showing folder structure only.</p>
    {/if}
    <ul class="wallet-tree">
      {#each nodes as node (node.relativePath)}
        <WalletTreeNode {node} />
      {/each}
    </ul>
  {/if}
</section>

<style>
  .wallets-panel {
    border: var(--tc-border);
    background: var(--tc-color-black-2);
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .wallets-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--tc-space-2);
    padding: var(--tc-space-3);
    border-bottom: var(--tc-border-muted);
  }

  h2 {
    margin: 0;
    color: var(--tc-color-gray-1);
    text-transform: uppercase;
    font-size: 0.9rem;
    letter-spacing: var(--tc-sidebar-letter-spacing);
  }

  .path {
    margin: 0.35rem 0 0;
    color: var(--tc-color-gray-3);
    font-size: 0.68rem;
    text-transform: none;
    word-break: break-all;
  }

  .reload-button {
    border: var(--tc-border-muted);
    background: transparent;
    color: var(--tc-color-turquoise);
    font-family: inherit;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: var(--tc-sidebar-letter-spacing);
    padding: 0.35rem 0.5rem;
    cursor: pointer;
  }

  .reload-button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .status {
    margin: 0;
    padding: var(--tc-space-3);
    color: var(--tc-color-gray-1);
    text-transform: uppercase;
    font-size: 0.72rem;
    letter-spacing: var(--tc-sidebar-letter-spacing);
  }

  .status.error {
    color: var(--tc-color-red);
  }

  .wallet-tree {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
</style>
