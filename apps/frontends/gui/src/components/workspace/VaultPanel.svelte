<script lang="ts">
  export let value = "";
  export let busy = false;
  export let error = "";
  export let notice = "";
  export let filePath = "";
  export let templatePath = "";
  export let onReload: () => void;
  export let onSave: () => void;
</script>

<section class="vault-panel" aria-label="Secrets vault panel">
  <header class="vault-header">
    <div>
      <p class="kicker">Protected secrets</p>
      <h2>Vault JSON</h2>
      <p class="path">{filePath || "src/ai/brain/protected/no-read/vault.json"}</p>
      {#if templatePath}
        <p class="path subtle">Template: {templatePath}</p>
      {/if}
    </div>
    <div class="actions">
      <button type="button" class="btn muted" on:click={onReload} disabled={busy}>Reload</button>
      <button type="button" class="btn" on:click={onSave} disabled={busy}>Save Vault</button>
    </div>
  </header>

  <p class="hint">
    Fill keys used by <code>vault://...</code> refs: <code>rpc.helius.*</code>, <code>wallets.main.*</code>,
    <code>integrations.dexscreener.api-key</code>, <code>integrations.jupiter.api-key</code>.
  </p>
  <textarea bind:value class="editor" spellcheck="false" autocomplete="off"></textarea>

  {#if error}
    <p class="message error">{error}</p>
  {/if}
  {#if notice}
    <p class="message ok">{notice}</p>
  {/if}
</section>

<style>
  .vault-panel {
    border: var(--tc-border);
    background: var(--tc-color-black-2);
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--tc-space-3);
    padding: var(--tc-space-3);
  }

  .vault-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--tc-space-3);
  }

  .kicker {
    margin: 0;
    color: var(--tc-color-gray-2);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  h2 {
    margin: 0.25rem 0 0.4rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .path {
    margin: 0;
    color: var(--tc-color-gray-1);
    font-size: 0.7rem;
    word-break: break-all;
  }

  .path.subtle {
    color: var(--tc-color-gray-2);
    margin-top: 0.3rem;
  }

  .actions {
    display: flex;
    gap: var(--tc-space-2);
  }

  .btn {
    border: var(--tc-border);
    background: var(--tc-color-turquoise);
    color: var(--tc-color-black);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.68rem;
    padding: var(--tc-space-2) var(--tc-space-3);
    cursor: pointer;
    font-family: inherit;
  }

  .btn.muted {
    background: transparent;
    color: var(--tc-color-gray-1);
    border: var(--tc-border-muted);
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .hint {
    margin: 0;
    color: var(--tc-color-gray-1);
    font-size: 0.72rem;
    line-height: 1.4;
  }

  .hint code {
    color: var(--tc-color-turquoise);
  }

  .editor {
    flex: 1;
    min-height: 280px;
    border: var(--tc-border-muted);
    background: var(--tc-color-black-light);
    color: var(--tc-color-turquoise);
    padding: var(--tc-space-3);
    resize: vertical;
    font-family: "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.76rem;
    line-height: 1.45;
  }

  .message {
    margin: 0;
    border: var(--tc-border-muted);
    padding: var(--tc-space-2);
    font-size: 0.7rem;
    text-transform: uppercase;
  }

  .message.error {
    color: var(--tc-color-red);
    border-color: var(--tc-color-red);
  }

  .message.ok {
    color: var(--tc-color-lime);
    border-color: var(--tc-color-lime);
  }

  @media (max-width: 980px) {
    .vault-header {
      flex-direction: column;
    }
  }
</style>
