<script lang="ts">
  import type { GuiPublicRpcOptionView, GuiSecretCategory, GuiSecretEntryView, GuiSecretOptionView } from "@trenchclaw/types";

  let {
    options = [],
    entries = [],
    publicRpcOptions = [],
    busy = false,
    error = "",
    notice = "",
    filePath = "",
    templatePath = "",
    onReload = () => {},
    onSave = () => {},
    onClear = () => {},
  }: {
    options?: GuiSecretOptionView[];
    entries?: GuiSecretEntryView[];
    publicRpcOptions?: GuiPublicRpcOptionView[];
    busy?: boolean;
    error?: string;
    notice?: string;
    filePath?: string;
    templatePath?: string;
    onReload?: () => void;
    onSave?: (input: {
      optionId: string;
      value: string;
      source?: "custom" | "public";
      publicRpcId?: string | null;
    }) => Promise<void> | void;
    onClear?: (optionId: string) => Promise<void> | void;
  } = $props();

  let aiOptionId = $state("");
  let aiValue = $state("");
  let blockchainOptionId = $state("");
  let blockchainValue = $state("");
  let blockchainSource = $state<"custom" | "public">("custom");
  let blockchainPublicRpcId = $state("");

  const optionFor = (optionId: string): GuiSecretOptionView | undefined => options.find((option) => option.id === optionId);
  const entryFor = (optionId: string): GuiSecretEntryView | undefined => entries.find((entry) => entry.optionId === optionId);
  const optionsForCategory = (category: GuiSecretCategory): GuiSecretOptionView[] =>
    options.filter((option) => option.category === category);

  const hydrateAi = (optionId: string): void => {
    const entry = entryFor(optionId);
    aiOptionId = optionId;
    aiValue = entry?.value ?? "";
  };

  const hydrateBlockchain = (optionId: string): void => {
    const option = optionFor(optionId);
    const entry = entryFor(optionId);
    blockchainOptionId = optionId;
    blockchainValue = entry?.value ?? "";
    blockchainSource = entry?.source ?? "custom";
    blockchainPublicRpcId = entry?.publicRpcId ?? publicRpcOptions[0]?.id ?? "";
    if (option?.supportsPublicRpc && blockchainSource === "public" && !blockchainPublicRpcId) {
      blockchainPublicRpcId = publicRpcOptions[0]?.id ?? "";
    }
  };

  const saveAi = (): void => {
    if (!aiOptionId) {
      return;
    }
    void onSave({
      optionId: aiOptionId,
      value: aiValue.trim(),
    });
  };

  const saveBlockchain = (): void => {
    const option = optionFor(blockchainOptionId);
    if (!option) {
      return;
    }
    if (option.supportsPublicRpc && blockchainSource === "public") {
      const rpc = publicRpcOptions.find((candidate) => candidate.id === blockchainPublicRpcId);
      if (!rpc) {
        return;
      }
      void onSave({
        optionId: blockchainOptionId,
        value: rpc.url,
        source: "public",
        publicRpcId: rpc.id,
      });
      return;
    }
    void onSave({
      optionId: blockchainOptionId,
      value: blockchainValue.trim(),
      source: option.supportsPublicRpc ? "custom" : undefined,
      publicRpcId: option.supportsPublicRpc ? null : undefined,
    });
  };

  const clearAi = (): void => {
    if (!aiOptionId) {
      return;
    }
    aiValue = "";
    void onClear(aiOptionId);
  };

  const clearBlockchain = (): void => {
    if (!blockchainOptionId) {
      return;
    }
    blockchainValue = "";
    blockchainSource = "custom";
    void onClear(blockchainOptionId);
  };

  const aiOptions = $derived(optionsForCategory("ai"));
  const blockchainOptions = $derived(optionsForCategory("blockchain"));

  $effect(() => {
    if (aiOptions.length > 0 && !aiOptions.some((option) => option.id === aiOptionId)) {
      hydrateAi(aiOptions[0].id);
    }
  });

  $effect(() => {
    if (blockchainOptions.length > 0 && !blockchainOptions.some((option) => option.id === blockchainOptionId)) {
      hydrateBlockchain(blockchainOptions[0].id);
    }
  });

  $effect(() => {
    if (blockchainSource !== "public") {
      return;
    }
    const selectedRpc = publicRpcOptions.find((entry) => entry.id === blockchainPublicRpcId);
    blockchainValue = selectedRpc?.url ?? "";
  });
</script>

<section class="secrets-panel" aria-label="Manage keys and secrets panel">
  <header class="secrets-header">
    <div>
      <p class="kicker">Manage keys and secrets</p>
      <h2>Vault-backed credentials</h2>
      <p class="path">{filePath || "src/ai/brain/protected/no-read/vault.json"}</p>
      {#if templatePath}
        <p class="path subtle">Template: {templatePath}</p>
      {/if}
    </div>
    <div class="actions">
      <button type="button" class="btn muted" onclick={onReload} disabled={busy}>Reload</button>
    </div>
  </header>

  <div class="section-grid">
    <section class="secret-section" aria-label="AI keys">
      <h3>AI</h3>
      <label class="field">
        <span>Key type</span>
        <select
          bind:value={aiOptionId}
          disabled={busy}
          onchange={() => {
            hydrateAi(aiOptionId);
          }}
        >
          {#each aiOptions as option (option.id)}
            <option value={option.id}>{option.label}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>Value</span>
        <input
          type="text"
          bind:value={aiValue}
          disabled={busy}
          placeholder={optionFor(aiOptionId)?.placeholder ?? "Enter value"}
        />
      </label>
      <div class="row-actions">
        <button type="button" class="btn" disabled={busy || !aiOptionId} onclick={saveAi}>
          Save
        </button>
        <button type="button" class="btn muted" disabled={busy || !aiOptionId} onclick={clearAi}>
          Clear
        </button>
      </div>
    </section>

    <section class="secret-section" aria-label="Blockchain keys">
      <h3>Blockchain</h3>
      <label class="field">
        <span>Key type</span>
        <select
          bind:value={blockchainOptionId}
          disabled={busy}
          onchange={() => {
            hydrateBlockchain(blockchainOptionId);
          }}
        >
          {#each blockchainOptions as option (option.id)}
            <option value={option.id}>{option.label}</option>
          {/each}
        </select>
      </label>

      {#if optionFor(blockchainOptionId)?.supportsPublicRpc}
        <label class="field">
          <span>RPC source</span>
          <select bind:value={blockchainSource} disabled={busy}>
            <option value="custom">Custom RPC URL</option>
            <option value="public">Use public Solana RPC</option>
          </select>
        </label>
        {#if blockchainSource === "public"}
          <label class="field">
            <span>Public RPC</span>
            <select bind:value={blockchainPublicRpcId} disabled={busy}>
              {#each publicRpcOptions as rpc (rpc.id)}
                <option value={rpc.id}>{rpc.label}</option>
              {/each}
            </select>
          </label>
        {/if}
      {/if}

      <label class="field">
        <span>Value</span>
        <input
          type="text"
          bind:value={blockchainValue}
          disabled={busy || (optionFor(blockchainOptionId)?.supportsPublicRpc && blockchainSource === "public")}
          placeholder={optionFor(blockchainOptionId)?.placeholder ?? "Enter value"}
        />
      </label>
      <div class="row-actions">
        <button
          type="button"
          class="btn"
          disabled={busy || !blockchainOptionId}
          onclick={saveBlockchain}
        >
          Save
        </button>
        <button
          type="button"
          class="btn muted"
          disabled={busy || !blockchainOptionId}
          onclick={clearBlockchain}
        >
          Clear
        </button>
      </div>
    </section>
  </div>

  {#if error}
    <p class="message error">{error}</p>
  {/if}
  {#if notice}
    <p class="message ok">{notice}</p>
  {/if}
</section>

<style>
  .secrets-panel {
    border: var(--tc-border);
    background: var(--tc-color-black);
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--tc-space-3);
    padding: var(--tc-space-3);
    overflow: auto;
  }

  .secrets-header {
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

  h3 {
    margin: 0;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--tc-color-turquoise);
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

  .section-grid {
    display: grid;
    gap: var(--tc-space-3);
    grid-template-columns: 1fr 1fr;
  }

  .secret-section {
    border: var(--tc-border-muted);
    padding: var(--tc-space-3);
    display: grid;
    gap: var(--tc-space-3);
  }

  .field {
    display: grid;
    gap: var(--tc-space-1);
    color: var(--tc-color-gray-1);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .field select,
  .field input {
    border: var(--tc-border-muted);
    background: #061317;
    color: #9ff6e3;
    padding: 8px 10px;
    font-family: inherit;
    font-size: 0.75rem;
  }

  .field select:disabled,
  .field input:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .row-actions {
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
    color: var(--tc-color-green);
    border-color: var(--tc-color-green);
  }

  @media (max-width: 980px) {
    .secrets-header {
      flex-direction: column;
    }

    .section-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
