<script lang="ts">
  import type { GuiPublicRpcOptionView, GuiSecretOptionView } from "@trenchclaw/types";
  import RetroButton from "../../ui/RetroButton.svelte";
  import RetroField from "../../ui/RetroField.svelte";
  import RetroInput from "../../ui/RetroInput.svelte";
  import RetroSelect from "../../ui/RetroSelect.svelte";
  import type { SecretCategory, SecretDraftRow } from "./secret-editor-types";

  export let category: SecretCategory;
  export let row: SecretDraftRow;
  export let option: GuiSecretOptionView | undefined;
  export let options: GuiSecretOptionView[] = [];
  export let selectedOptionIds: Set<string> = new Set();
  export let publicRpcOptions: GuiPublicRpcOptionView[] = [];
  export let busy = false;
  export let removable = false;

  export let onOptionChange: (rowKey: string, optionId: string) => void;
  export let onValueChange: (rowKey: string, value: string) => void;
  export let onSourceChange: (rowKey: string, source: "custom" | "public") => void;
  export let onPublicRpcChange: (rowKey: string, publicRpcId: string) => void;
  export let onSave: (row: SecretDraftRow) => void;
  export let onClear: (category: SecretCategory, row: SecretDraftRow) => void;
  export let onRemove: (category: SecretCategory, rowKey: string) => void;
</script>

<article class="secret-row">
  <RetroField label="Key type">
    <RetroSelect
      value={row.optionId}
      disabled={busy}
      on:change={(event) => {
        const target = event.currentTarget as HTMLSelectElement;
        onOptionChange(row.rowKey, target.value);
      }}
    >
      <option value="">Select key type</option>
      {#each options as item (item.id)}
        <option value={item.id} disabled={selectedOptionIds.has(item.id)}>{item.label}</option>
      {/each}
    </RetroSelect>
  </RetroField>

  {#if option?.supportsPublicRpc && category === "blockchain"}
    <RetroField label="RPC source">
      <RetroSelect
        value={row.source}
        disabled={busy || !row.optionId}
        on:change={(event) => {
          const target = event.currentTarget as HTMLSelectElement;
          onSourceChange(row.rowKey, target.value === "public" ? "public" : "custom");
        }}
      >
        <option value="custom">Custom RPC URL</option>
        <option value="public">Use public Solana RPC</option>
      </RetroSelect>
    </RetroField>

    {#if row.source === "public"}
      <RetroField label="Public RPC">
        <RetroSelect
          value={row.publicRpcId}
          disabled={busy || !row.optionId}
          on:change={(event) => {
            const target = event.currentTarget as HTMLSelectElement;
            onPublicRpcChange(row.rowKey, target.value);
          }}
        >
          {#each publicRpcOptions as rpc (rpc.id)}
            <option value={rpc.id}>{rpc.label}</option>
          {/each}
        </RetroSelect>
      </RetroField>
    {/if}
  {/if}

  <RetroField label="Value">
    <RetroInput
      value={row.value}
      disabled={busy || !row.optionId || (option?.supportsPublicRpc && row.source === "public")}
      placeholder={option?.placeholder ?? "Enter value"}
      on:input={(event) => {
        const target = event.currentTarget as HTMLInputElement;
        onValueChange(row.rowKey, target.value);
      }}
    />
  </RetroField>

  <div class="row-actions">
    <RetroButton disabled={busy || !row.optionId} on:click={() => onSave(row)}>Save</RetroButton>
    <RetroButton variant="secondary" disabled={busy || !row.optionId} on:click={() => onClear(category, row)}>
      Clear
    </RetroButton>
    <RetroButton variant="secondary" disabled={busy || !removable} on:click={() => onRemove(category, row.rowKey)}>
      Remove
    </RetroButton>
  </div>
</article>

<style>
  .secret-row {
    display: grid;
    gap: var(--tc-space-2);
    min-width: 0;
    border: var(--tc-row-box-border);
    background: var(--tc-row-box-bg);
    padding: var(--tc-row-box-padding);
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--tc-space-2);
  }

  :global(.secret-row .retro-field) {
    min-width: 0;
  }

  :global(.secret-row .retro-input),
  :global(.secret-row .retro-select) {
    min-width: 0;
    box-sizing: border-box;
    font-size: var(--tc-chat-text-size);
  }
</style>
