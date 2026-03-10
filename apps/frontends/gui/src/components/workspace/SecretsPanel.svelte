<script lang="ts">
  import type {
    GuiPublicRpcOptionView,
    GuiSecretCategory,
    GuiSecretEntryView,
    GuiSecretOptionView,
  } from "@trenchclaw/types";
  import RetroButton from "../ui/RetroButton.svelte";
  import RetroDivider from "../ui/RetroDivider.svelte";
  import RetroSectionHeader from "../ui/RetroSectionHeader.svelte";
  import RetroStatusMessage from "../ui/RetroStatusMessage.svelte";
  import SecretCategorySection from "./secrets/SecretCategorySection.svelte";
  import type { SecretDraftRow } from "./secrets/secret-editor-types";

  export let options: GuiSecretOptionView[] = [];
  export let entries: GuiSecretEntryView[] = [];
  export let publicRpcOptions: GuiPublicRpcOptionView[] = [];
  export let busy = false;
  export let error = "";
  export let llmCheckBusy = false;
  export let llmCheckMessage = "";
  export let onReload: () => void = () => {};
  export let onCheckLlm: () => void = () => {};
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
  const DEFAULT_BLOCKCHAIN_OPTION_ID = "solana-rpc-url";
  const DEFAULT_MAINNET_RPC_ID = "solana-mainnet-beta";

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

    if (category === "blockchain") {
      const rpcOption = categoryOptions.find((option) => option.id === DEFAULT_BLOCKCHAIN_OPTION_ID) ?? categoryOptions[0];
      const seed = [rpcOption, ...withValues.filter((option) => option.id !== rpcOption.id)];
      return seed.filter(Boolean).map((option) => createRowFromOptionId(option.id));
    }

    const seed = withValues.length > 0 ? withValues : [categoryOptions[0]];
    return seed.filter(Boolean).map((option) => createRowFromOptionId(option.id));
  };

  const createHydrationSignature = (): string =>
    JSON.stringify({
      optionIds: options.map((option) => option.id),
      entryValues: entries.map((entry) => [entry.optionId, entry.value, entry.source, entry.publicRpcId]),
      rpcIds: publicRpcOptions.map((rpc) => rpc.id),
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

  $: statusErrorText = error.trim();
  $: llmStatusText = llmCheckMessage.trim();
</script>

<section class="secrets-panel" aria-label="Keys and secrets panel">
  <header class="secrets-header">
    <RetroSectionHeader title="Keys and secrets" />
    <div class="actions">
      <RetroButton variant="secondary" disabled={busy} on:click={handleReload}>Reload</RetroButton>
      <RetroButton variant="secondary" disabled={busy || llmCheckBusy} on:click={onCheckLlm}>Test AI connection</RetroButton>
    </div>
  </header>

  <div class="section-stack">
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
    background: var(--tc-color-black);
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

  @media (max-width: var(--tc-layout-breakpoint)) {
    .secrets-header {
      flex-direction: column;
    }
  }
</style>
