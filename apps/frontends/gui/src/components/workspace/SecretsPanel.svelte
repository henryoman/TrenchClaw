<script lang="ts">
  import type {
    GuiAiSettingsView,
    GuiPublicRpcOptionView,
    GuiSecretCategory,
    GuiSecretEntryView,
    GuiSecretOptionView,
  } from "@trenchclaw/types";
  import RetroButton from "../ui/RetroButton.svelte";
  import RetroDivider from "../ui/RetroDivider.svelte";
  import RetroField from "../ui/RetroField.svelte";
  import RetroInput from "../ui/RetroInput.svelte";
  import RetroSelect from "../ui/RetroSelect.svelte";
  import RetroSectionHeader from "../ui/RetroSectionHeader.svelte";
  import RetroStatusMessage from "../ui/RetroStatusMessage.svelte";
  import SecretCategorySection from "./secrets/SecretCategorySection.svelte";
  import type { SecretDraftRow } from "./secrets/secret-editor-types";

  export let aiSettingsFilePath = "";
  export let aiSettingsTemplatePath = "";
  export let aiSettings: GuiAiSettingsView | null = null;
  export let aiSettingsBusy = false;
  export let aiSettingsError = "";
  export let options: GuiSecretOptionView[] = [];
  export let entries: GuiSecretEntryView[] = [];
  export let publicRpcOptions: GuiPublicRpcOptionView[] = [];
  export let busy = false;
  export let error = "";
  export let llmCheckBusy = false;
  export let llmCheckMessage = "";
  export let onReload: () => void = () => {};
  export let onReloadAiSettings: () => void = () => {};
  export let onCheckLlm: () => void = () => {};
  export let onSaveAiSettings: (settings: GuiAiSettingsView) => Promise<void> | void = () => {};
  export let onSave: (input: {
    optionId: string;
    value: string;
    source?: "custom" | "public";
    publicRpcId?: string | null;
  }) => Promise<void> | void = () => {};
  export let onClear: (optionId: string) => Promise<void> | void = () => {};

  let aiRows: SecretDraftRow[] = [];
  let blockchainRows: SecretDraftRow[] = [];
  let rowCounter = 0;
  let hydrationSignature = "";
  let dirtyRowKeys = new Set<string>();
  let aiSettingsDraft: GuiAiSettingsView = {
    provider: "openrouter",
    model: "",
    baseURL: "",
    defaultMode: "primary",
    temperature: null,
    maxOutputTokens: null,
  };
  let aiSettingsHydrationSignature = "";
  let aiSettingsDirty = false;
  const DEFAULT_BLOCKCHAIN_OPTION_ID = "solana-rpc-url";
  const DEFAULT_MAINNET_RPC_ID = "solana-mainnet-beta";
  const CORE_AI_OPTION_IDS = [
    "openrouter-api-key",
    "vercel-ai-gateway-api-key",
    "openai-api-key",
    "anthropic-api-key",
    "google-ai-api-key",
    "openai-compatible-api-key",
  ];
  const CORE_BLOCKCHAIN_OPTION_IDS = [
    "solana-rpc-url",
    "helius-http-url",
    "helius-ws-url",
    "helius-api-key",
    "jupiter-api-key",
    "ultra-signer-private-key",
    "ultra-signer-private-key-encoding",
  ];

  const nextRowKey = (): string => {
    rowCounter += 1;
    return `row-${rowCounter}`;
  };

  const optionFor = (optionId: string): GuiSecretOptionView | undefined =>
    options.find((option) => option.id === optionId);

  const entryFor = (optionId: string): GuiSecretEntryView | undefined =>
    entries.find((entry) => entry.optionId === optionId);

  const optionsForCategory = (category: GuiSecretCategory): GuiSecretOptionView[] =>
    options.filter((option) => option.category === category);

  const firstRpcId = (): string => publicRpcOptions[0]?.id ?? "";

  const defaultPublicRpcId = (): string => {
    const preferred = publicRpcOptions.find((rpc) => rpc.id === DEFAULT_MAINNET_RPC_ID);
    return preferred?.id ?? firstRpcId();
  };

  const valueForPublicRpc = (rpcId: string): string =>
    publicRpcOptions.find((rpc) => rpc.id === rpcId)?.url ?? "";

  const createRowFromOptionId = (optionId = ""): SecretDraftRow => {
    const entry = optionId ? entryFor(optionId) : undefined;
    const option = optionId ? optionFor(optionId) : undefined;
    const source = option?.supportsPublicRpc ? "public" : (entry?.source ?? "custom");
    const publicRpcId = option?.supportsPublicRpc ? (entry?.publicRpcId ?? defaultPublicRpcId()) : firstRpcId();
    const value = option?.supportsPublicRpc ? valueForPublicRpc(publicRpcId) : (entry?.value ?? "");

    return {
      rowKey: nextRowKey(),
      optionId,
      value,
      source,
      publicRpcId,
    };
  };

  const rowsForCategoryFromEntries = (category: GuiSecretCategory): SecretDraftRow[] => {
    const categoryOptions = optionsForCategory(category);
    if (categoryOptions.length === 0) {
      return [];
    }

    const withValues = categoryOptions.filter((option) => {
      const entry = entryFor(option.id);
      return (entry?.value ?? "").trim().length > 0;
    });

    const coreOptionIds = category === "blockchain" ? CORE_BLOCKCHAIN_OPTION_IDS : CORE_AI_OPTION_IDS;
    const coreOptions = coreOptionIds
      .map((optionId) => categoryOptions.find((option) => option.id === optionId))
      .filter((option): option is GuiSecretOptionView => Boolean(option));
    const optionalSavedOptions = withValues.filter((option) => !coreOptionIds.includes(option.id));
    const seed = [...coreOptions, ...optionalSavedOptions];

    if (seed.length > 0) {
      return seed.map((option) => createRowFromOptionId(option.id));
    }

    const fallbackOption =
      category === "blockchain"
        ? categoryOptions.find((option) => option.id === DEFAULT_BLOCKCHAIN_OPTION_ID) ?? categoryOptions[0]
        : categoryOptions[0];
    return fallbackOption ? [createRowFromOptionId(fallbackOption.id)] : [];
  };

  const createHydrationSignature = (): string =>
    JSON.stringify({
      optionIds: options.map((option) => option.id),
      entryValues: entries.map((entry) => [entry.optionId, entry.value, entry.source, entry.publicRpcId]),
      rpcIds: publicRpcOptions.map((rpc) => rpc.id),
    });

  const createAiSettingsHydrationSignature = (): string =>
    JSON.stringify({
      aiSettings,
      aiSettingsFilePath,
      aiSettingsTemplatePath,
    });

  const selectedOptionIds = (rows: SecretDraftRow[], exceptRowKey?: string): Set<string> =>
    new Set(rows.filter((row) => row.rowKey !== exceptRowKey && row.optionId).map((row) => row.optionId));

  const firstUnselectedOptionId = (category: GuiSecretCategory, rows: SecretDraftRow[]): string => {
    const selected = selectedOptionIds(rows);
    const candidate = optionsForCategory(category).find((option) => !selected.has(option.id));
    return candidate?.id ?? "";
  };

  const addRow = (category: GuiSecretCategory): void => {
    if (category === "ai") {
      aiRows = [...aiRows, createRowFromOptionId(firstUnselectedOptionId("ai", aiRows))];
      return;
    }
    blockchainRows = [...blockchainRows, createRowFromOptionId(firstUnselectedOptionId("blockchain", blockchainRows))];
  };

  const removeRow = (category: GuiSecretCategory, rowKey: string): void => {
    if (category === "ai") {
      aiRows = aiRows.filter((row) => row.rowKey !== rowKey);
      return;
    }
    blockchainRows = blockchainRows.filter((row) => row.rowKey !== rowKey);
  };

  const updateRow = (
    category: GuiSecretCategory,
    rowKey: string,
    updater: (row: SecretDraftRow) => SecretDraftRow,
  ): void => {
    if (category === "ai") {
      aiRows = aiRows.map((row) => (row.rowKey === rowKey ? updater(row) : row));
      return;
    }
    blockchainRows = blockchainRows.map((row) => (row.rowKey === rowKey ? updater(row) : row));
  };

  const onOptionChange = (category: GuiSecretCategory, rowKey: string, optionId: string): void => {
    const entry = entryFor(optionId);
    const option = optionFor(optionId);
    const source = option?.supportsPublicRpc ? "public" : (entry?.source ?? "custom");
    const publicRpcId = option?.supportsPublicRpc ? (entry?.publicRpcId ?? defaultPublicRpcId()) : firstRpcId();
    const value = option?.supportsPublicRpc ? valueForPublicRpc(publicRpcId) : (entry?.value ?? "");

    updateRow(category, rowKey, (row) => ({
      ...row,
      optionId,
      source,
      publicRpcId,
      value,
    }));
    dirtyRowKeys = new Set([...dirtyRowKeys, rowKey]);
  };

  const onValueChange = (category: GuiSecretCategory, rowKey: string, value: string): void => {
    updateRow(category, rowKey, (row) => ({ ...row, value }));
    dirtyRowKeys = new Set([...dirtyRowKeys, rowKey]);
  };

  const saveRow = (row: SecretDraftRow): void => {
    const option = optionFor(row.optionId);
    if (!option) {
      return;
    }

    if (option.supportsPublicRpc) {
      const rpcId = row.publicRpcId || defaultPublicRpcId();
      const rpc = publicRpcOptions.find((candidate) => candidate.id === rpcId);
      if (!rpc) {
        return;
      }
      Promise.resolve(
        onSave({
          optionId: row.optionId,
          value: rpc.url,
          source: "public",
          publicRpcId: rpc.id,
        }),
      )
        .then(() => {
          dirtyRowKeys.delete(row.rowKey);
          dirtyRowKeys = new Set(dirtyRowKeys);
        })
        .catch(() => {});
      return;
    }

    Promise.resolve(
      onSave({
        optionId: row.optionId,
        value: row.value.trim(),
        source: option.supportsPublicRpc ? "custom" : undefined,
        publicRpcId: option.supportsPublicRpc ? null : undefined,
      }),
    )
      .then(() => {
        dirtyRowKeys.delete(row.rowKey);
        dirtyRowKeys = new Set(dirtyRowKeys);
      })
      .catch(() => {});
  };

  const handleReload = (): void => {
    if (dirtyRowKeys.size > 0) {
      const proceed = window.confirm("You have unsaved key changes. Reload and discard them?");
      if (!proceed) {
        return;
      }
    }
    dirtyRowKeys = new Set();
    onReload();
  };

  const handleReloadAiSettings = (): void => {
    if (aiSettingsDirty) {
      const proceed = window.confirm("You have unsaved AI settings changes. Reload and discard them?");
      if (!proceed) {
        return;
      }
    }
    aiSettingsDirty = false;
    onReloadAiSettings();
  };

  const onAiSettingChange = <K extends keyof GuiAiSettingsView>(key: K, value: GuiAiSettingsView[K]): void => {
    aiSettingsDraft = {
      ...aiSettingsDraft,
      [key]: value,
    };
    aiSettingsDirty = true;
  };

  const saveAiSettings = (): void => {
    const normalized: GuiAiSettingsView = {
      provider: aiSettingsDraft.provider,
      model: aiSettingsDraft.model.trim(),
      baseURL: aiSettingsDraft.baseURL.trim(),
      defaultMode: aiSettingsDraft.defaultMode.trim() || "primary",
      temperature: aiSettingsDraft.temperature,
      maxOutputTokens: aiSettingsDraft.maxOutputTokens,
    };
    Promise.resolve(onSaveAiSettings(normalized))
      .then(() => {
        aiSettingsDirty = false;
      })
      .catch(() => {});
  };

  const clearRow = (category: GuiSecretCategory, row: SecretDraftRow): void => {
    if (!row.optionId) {
      return;
    }
    const option = optionFor(row.optionId);
    if (option?.supportsPublicRpc && category === "blockchain") {
      const publicRpcId = defaultPublicRpcId();
      updateRow(category, row.rowKey, (current) => ({
        ...current,
        source: "public",
        publicRpcId,
        value: valueForPublicRpc(publicRpcId),
      }));
      return;
    }
    updateRow(category, row.rowKey, (current) => ({
      ...current,
      value: "",
      source: "custom",
      publicRpcId: firstRpcId(),
    }));
    dirtyRowKeys.delete(row.rowKey);
    dirtyRowKeys = new Set(dirtyRowKeys);
    void onClear(row.optionId);
  };

  $: {
    const signature = createHydrationSignature();
    if (signature !== hydrationSignature) {
      aiRows = rowsForCategoryFromEntries("ai");
      blockchainRows = rowsForCategoryFromEntries("blockchain");
      hydrationSignature = signature;
      dirtyRowKeys = new Set();
    }
  }

  $: {
    const signature = createAiSettingsHydrationSignature();
    if (signature !== aiSettingsHydrationSignature && aiSettings) {
      aiSettingsDraft = { ...aiSettings };
      aiSettingsHydrationSignature = signature;
      aiSettingsDirty = false;
    }
  }

  $: statusErrorText = error.trim();
  $: aiSettingsErrorText = aiSettingsError.trim();
  $: llmStatusText = llmCheckMessage.trim();
</script>

<section class="secrets-panel" aria-label="Config panel">
  <header class="secrets-header">
    <RetroSectionHeader title="Config" />
    <div class="actions">
      <RetroButton variant="secondary" disabled={busy} on:click={handleReload}>Reload</RetroButton>
      <RetroButton variant="secondary" disabled={busy || llmCheckBusy} on:click={onCheckLlm}>Test AI connection</RetroButton>
    </div>
  </header>

  <div class="section-stack">
    <section class="ai-settings-section" aria-label="AI settings">
      <div class="section-heading">
        <div>
          <p class="section-label">AI settings</p>
          <p class="section-meta">{aiSettingsFilePath || "No AI settings file detected."}</p>
        </div>
        <div class="actions">
          <RetroButton variant="secondary" disabled={aiSettingsBusy} on:click={handleReloadAiSettings}>Reload AI settings</RetroButton>
          <RetroButton
            variant="primary"
            disabled={aiSettingsBusy || !aiSettingsDraft.model.trim() || !aiSettingsDraft.defaultMode.trim()}
            on:click={saveAiSettings}
          >
            Save AI settings
          </RetroButton>
        </div>
      </div>

      <div class="ai-settings-grid">
        <RetroField label="Provider">
          <RetroSelect
            value={aiSettingsDraft.provider}
            disabled={aiSettingsBusy}
            on:change={(event) => {
              const target = event.currentTarget as HTMLSelectElement;
              onAiSettingChange("provider", target.value as GuiAiSettingsView["provider"]);
            }}
          >
            <option value="openrouter">OpenRouter</option>
            <option value="openai">OpenAI</option>
            <option value="openai-compatible">OpenAI-compatible</option>
          </RetroSelect>
        </RetroField>

        <RetroField label="Model">
          <RetroInput
            value={aiSettingsDraft.model}
            placeholder="stepfun/step-3.5-flash:free"
            disabled={aiSettingsBusy}
            on:input={(event) => {
              const target = event.currentTarget as HTMLInputElement;
              onAiSettingChange("model", target.value);
            }}
          />
        </RetroField>

        <RetroField label="Base URL">
          <RetroInput
            value={aiSettingsDraft.baseURL}
            placeholder="https://openrouter.ai/api/v1"
            disabled={aiSettingsBusy}
            on:input={(event) => {
              const target = event.currentTarget as HTMLInputElement;
              onAiSettingChange("baseURL", target.value);
            }}
          />
        </RetroField>

        <RetroField label="Default mode">
          <RetroInput
            value={aiSettingsDraft.defaultMode}
            placeholder="primary"
            disabled={aiSettingsBusy}
            on:input={(event) => {
              const target = event.currentTarget as HTMLInputElement;
              onAiSettingChange("defaultMode", target.value);
            }}
          />
        </RetroField>

        <RetroField label="Temperature">
          <RetroInput
            value={aiSettingsDraft.temperature === null ? "" : String(aiSettingsDraft.temperature)}
            placeholder="blank = provider default"
            disabled={aiSettingsBusy}
            on:input={(event) => {
              const target = event.currentTarget as HTMLInputElement;
              const next = target.value.trim();
              onAiSettingChange("temperature", next.length === 0 ? null : Number(next));
            }}
          />
        </RetroField>

        <RetroField label="Max output tokens">
          <RetroInput
            value={aiSettingsDraft.maxOutputTokens === null ? "" : String(aiSettingsDraft.maxOutputTokens)}
            placeholder="blank = runtime default"
            disabled={aiSettingsBusy}
            on:input={(event) => {
              const target = event.currentTarget as HTMLInputElement;
              const next = target.value.trim();
              onAiSettingChange("maxOutputTokens", next.length === 0 ? null : Number(next));
            }}
          />
        </RetroField>
      </div>

      {#if aiSettingsTemplatePath}
        <p class="section-meta">Template: {aiSettingsTemplatePath}</p>
      {/if}
    </section>

    <RetroStatusMessage tone="error" text={aiSettingsErrorText} />

    <RetroDivider />

    <SecretCategorySection
      title="AI"
      category="ai"
      rows={aiRows}
      options={optionsForCategory("ai")}
      {busy}
      {optionFor}
      onAdd={addRow}
      {onOptionChange}
      {onValueChange}
      onSave={saveRow}
      onClear={clearRow}
      onRemove={removeRow}
    />

    <RetroDivider />

    <SecretCategorySection
      title="Blockchain"
      category="blockchain"
      rows={blockchainRows}
      options={optionsForCategory("blockchain")}
      {busy}
      {optionFor}
      onAdd={addRow}
      {onOptionChange}
      {onValueChange}
      onSave={saveRow}
      onClear={clearRow}
      onRemove={removeRow}
    />
  </div>

  <RetroStatusMessage tone="error" text={statusErrorText} />
  <RetroStatusMessage tone={llmStatusText.includes("probe=ok") ? "ok" : "error"} text={llmStatusText} />
</section>

<style>
  .secrets-panel {
    border: var(--tc-border);
    background: var(--tc-color-black-2);
    min-height: 0;
    min-width: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--tc-space-3);
    padding: var(--tc-space-3);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .secrets-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--tc-space-3);
    min-width: 0;
  }

  .actions {
    display: flex;
    gap: var(--tc-space-2);
    flex-wrap: wrap;
  }

  .section-stack {
    display: grid;
    gap: var(--tc-space-4);
    min-width: 0;
  }

  .ai-settings-section {
    display: grid;
    gap: var(--tc-space-3);
    min-width: 0;
  }

  .section-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--tc-space-3);
    flex-wrap: wrap;
  }

  .section-label {
    margin: 0;
    color: var(--tc-color-gray-3);
    font-size: var(--tc-field-label-size);
    letter-spacing: var(--tc-field-label-letter-spacing);
    text-transform: uppercase;
  }

  .section-meta {
    margin: 0.35rem 0 0;
    color: var(--tc-color-gray-1);
    font-size: 0.8rem;
    word-break: break-all;
  }

  .ai-settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--tc-space-3);
    min-width: 0;
  }

  @media (max-width: var(--tc-layout-breakpoint)) {
    .secrets-header {
      flex-direction: column;
    }

    .section-heading {
      flex-direction: column;
    }

    .ai-settings-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
