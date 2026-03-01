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
  import type { SecretDraftRow, SecretStatusMessage } from "./secrets/secret-editor-types";

  export let options: GuiSecretOptionView[] = [];
  export let entries: GuiSecretEntryView[] = [];
  export let publicRpcOptions: GuiPublicRpcOptionView[] = [];
  export let busy = false;
  export let error = "";
  export let notice = "";
  export let onReload: () => void = () => {};
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

  const valueForPublicRpc = (rpcId: string): string =>
    publicRpcOptions.find((rpc) => rpc.id === rpcId)?.url ?? "";

  const createRowFromOptionId = (optionId = ""): SecretDraftRow => {
    const entry = optionId ? entryFor(optionId) : undefined;
    const option = optionId ? optionFor(optionId) : undefined;
    const source = entry?.source ?? "custom";
    const publicRpcId = entry?.publicRpcId ?? firstRpcId();
    const value =
      option?.supportsPublicRpc && source === "public"
        ? valueForPublicRpc(publicRpcId)
        : (entry?.value ?? "");

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
    const source = entry?.source ?? "custom";
    const publicRpcId = entry?.publicRpcId ?? firstRpcId();
    const value =
      option?.supportsPublicRpc && source === "public"
        ? valueForPublicRpc(publicRpcId)
        : (entry?.value ?? "");

    updateRow(category, rowKey, (row) => ({
      ...row,
      optionId,
      source,
      publicRpcId,
      value,
    }));
  };

  const onValueChange = (category: GuiSecretCategory, rowKey: string, value: string): void => {
    updateRow(category, rowKey, (row) => ({ ...row, value }));
  };

  const onSourceChange = (rowKey: string, source: "custom" | "public"): void => {
    updateRow("blockchain", rowKey, (row) => {
      const publicRpcId = row.publicRpcId || firstRpcId();
      return {
        ...row,
        source,
        publicRpcId,
        value: source === "public" ? valueForPublicRpc(publicRpcId) : row.value,
      };
    });
  };

  const onPublicRpcChange = (rowKey: string, publicRpcId: string): void => {
    updateRow("blockchain", rowKey, (row) => ({
      ...row,
      publicRpcId,
      value: valueForPublicRpc(publicRpcId),
    }));
  };

  const saveRow = (row: SecretDraftRow): void => {
    const option = optionFor(row.optionId);
    if (!option) {
      return;
    }

    if (option.supportsPublicRpc && row.source === "public") {
      const rpc = publicRpcOptions.find((candidate) => candidate.id === row.publicRpcId);
      if (!rpc) {
        return;
      }
      void onSave({
        optionId: row.optionId,
        value: rpc.url,
        source: "public",
        publicRpcId: rpc.id,
      });
      return;
    }

    void onSave({
      optionId: row.optionId,
      value: row.value.trim(),
      source: option.supportsPublicRpc ? "custom" : undefined,
      publicRpcId: option.supportsPublicRpc ? null : undefined,
    });
  };

  const clearRow = (category: GuiSecretCategory, row: SecretDraftRow): void => {
    if (!row.optionId) {
      return;
    }
    updateRow(category, row.rowKey, (current) => ({
      ...current,
      value: "",
      source: "custom",
      publicRpcId: firstRpcId(),
    }));
    void onClear(row.optionId);
  };

  $: {
    const signature = createHydrationSignature();
    if (signature !== hydrationSignature) {
      aiRows = rowsForCategoryFromEntries("ai");
      blockchainRows = rowsForCategoryFromEntries("blockchain");
      hydrationSignature = signature;
    }
  }

  $: statusMessage = ((): SecretStatusMessage | null => {
    if (error.trim()) {
      return { tone: "error", text: error.trim() };
    }
    if (notice.trim()) {
      return { tone: "ok", text: notice.trim() };
    }
    return null;
  })();
</script>

<section class="secrets-panel" aria-label="Manage keys and secrets panel">
  <header class="secrets-header">
    <RetroSectionHeader title="Manage keys and secrets" />
    <div class="actions">
      <RetroButton variant="secondary" disabled={busy} on:click={onReload}>Reload</RetroButton>
    </div>
  </header>

  <div class="section-stack">
    <SecretCategorySection
      title="AI"
      category="ai"
      rows={aiRows}
      options={optionsForCategory("ai")}
      {publicRpcOptions}
      {busy}
      {optionFor}
      onAdd={addRow}
      {onOptionChange}
      {onValueChange}
      {onSourceChange}
      {onPublicRpcChange}
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
      {publicRpcOptions}
      {busy}
      {optionFor}
      onAdd={addRow}
      {onOptionChange}
      {onValueChange}
      {onSourceChange}
      {onPublicRpcChange}
      onSave={saveRow}
      onClear={clearRow}
      onRemove={removeRow}
    />
  </div>

  <RetroStatusMessage tone={statusMessage?.tone ?? "ok"} text={statusMessage?.text ?? ""} />
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
