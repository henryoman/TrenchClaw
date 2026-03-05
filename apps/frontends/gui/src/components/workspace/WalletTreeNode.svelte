<script lang="ts">
  import type { GuiWalletNodeView } from "@trenchclaw/types";
  import { runtimeApi } from "../../runtime-api";

  export let node: GuiWalletNodeView;
  export let depth = 0;

  $: indentPx = depth * 14;
</script>

<li class="wallet-node">
  <div class="wallet-row" style={`padding-left: ${indentPx}px`}>
    <span class="icon" aria-hidden="true">{node.kind === "directory" ? "📁" : "🔑"}</span>
    <span class="name">{node.name}</span>
    {#if node.kind === "file"}
      <a
        class="backup-link"
        href={runtimeApi.walletBackupDownloadUrl(node.relativePath)}
        download={node.name}
      >
        Backup
      </a>
    {/if}
  </div>

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
    padding-top: 0.3rem;
    padding-bottom: 0.3rem;
  }

  .icon {
    width: 1.2rem;
    text-align: center;
  }

  .name {
    color: var(--tc-color-gray-1);
    font-size: 0.8rem;
    letter-spacing: 0.04em;
    text-transform: none;
    word-break: break-word;
  }

  .backup-link {
    margin-left: auto;
    border: var(--tc-border-muted);
    color: var(--tc-color-turquoise);
    text-decoration: none;
    text-transform: uppercase;
    letter-spacing: var(--tc-sidebar-letter-spacing);
    font-size: 0.68rem;
    padding: 0.2rem 0.45rem;
  }

  .backup-link:hover {
    border-color: var(--tc-color-turquoise);
  }
</style>
