<script lang="ts">
  import type { GuiSecretOptionView } from "@trenchclaw/types";
  import RetroButton from "../../ui/RetroButton.svelte";
  import SecretRowEditor from "./SecretRowEditor.svelte";
  import type { SecretCategory, SecretDraftRow } from "./secret-editor-types";

  export let title = "";
  export let category: SecretCategory;
  export let rows: SecretDraftRow[] = [];
  export let options: GuiSecretOptionView[] = [];
  export let busy = false;

  export let optionFor: (optionId: string) => GuiSecretOptionView | undefined;
  export let onAdd: (category: SecretCategory) => void;
  export let onOptionChange: (category: SecretCategory, rowKey: string, optionId: string) => void;
  export let onValueChange: (category: SecretCategory, rowKey: string, value: string) => void;
  export let onSave: (row: SecretDraftRow) => void;
  export let onClear: (category: SecretCategory, row: SecretDraftRow) => void;
  export let onRemove: (category: SecretCategory, rowKey: string) => void;

  const selectedOptionIds = (rowsForCategory: SecretDraftRow[], exceptRowKey: string): Set<string> =>
    new Set(
      rowsForCategory
        .filter((row) => row.rowKey !== exceptRowKey && row.optionId)
        .map((row) => row.optionId),
    );
</script>

<section class="secret-section" aria-label={`${title} keys`}>
  <div class="section-title-row">
    <h3>{title}</h3>
    <RetroButton variant="secondary" disabled={busy} on:click={() => onAdd(category)}>+ Add key</RetroButton>
  </div>

  {#each rows as row (row.rowKey)}
    <SecretRowEditor
      {category}
      {row}
      option={optionFor(row.optionId)}
      {busy}
      removable={rows.length > 1 && row.optionId !== "solana-rpc-url"}
      options={options}
      selectedOptionIds={selectedOptionIds(rows, row.rowKey)}
      onOptionChange={(rowKey, optionId) => onOptionChange(category, rowKey, optionId)}
      onValueChange={(rowKey, value) => onValueChange(category, rowKey, value)}
      {onSave}
      {onClear}
      {onRemove}
    />
  {/each}
</section>

<style>
  .secret-section {
    display: grid;
    gap: var(--tc-space-3);
    min-width: 0;
  }

  .section-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--tc-space-2);
    min-width: 0;
  }

  h3 {
    margin: 0;
    font-size: var(--tc-section-title-size);
    text-transform: uppercase;
    letter-spacing: var(--tc-section-title-letter-spacing);
    color: var(--tc-color-turquoise);
  }

  @media (max-width: var(--tc-layout-breakpoint)) {
    .section-title-row {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
