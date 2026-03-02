<script lang="ts">
  import RetroButton from "../ui/RetroButton.svelte";
  import RetroField from "../ui/RetroField.svelte";
  import RetroInput from "../ui/RetroInput.svelte";
  import RetroSelect from "../ui/RetroSelect.svelte";
  import RetroModal from "../ui/RetroModal.svelte";
  import type { RuntimeSafetyProfile, SafetyProfileOption } from "../../config/app-config";

  export let name = "";
  export let safetyProfile: RuntimeSafetyProfile = "dangerous";
  export let pin = "";
  export let safetyProfileOptions: SafetyProfileOption[] = [];
  export let busy = false;
  export let onCancel: () => void;
  export let onCreate: () => void;
</script>

<RetroModal title="Create New Instance">
  <RetroField label="Instance Name">
    <RetroInput bind:value={name} placeholder="e.g. Alpha Desk" />
  </RetroField>
  <RetroField label="Security Level">
    <RetroSelect bind:value={safetyProfile}>
      {#each safetyProfileOptions as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </RetroSelect>
    <p class="safety-hint">
      {safetyProfileOptions.find((option) => option.value === safetyProfile)?.description ?? ""}
    </p>
  </RetroField>
  <RetroField label="PIN (Optional)">
    <RetroInput bind:value={pin} placeholder="Set a PIN for this instance" />
  </RetroField>
  <div class="actions">
    <RetroButton variant="secondary" disabled={busy} on:click={onCancel}>Cancel</RetroButton>
    <RetroButton disabled={busy} on:click={onCreate}>Create</RetroButton>
  </div>
</RetroModal>

<style>
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--tc-space-2);
  }

  .safety-hint {
    margin: 0;
    color: var(--tc-color-gray-1);
    font-size: 0.75rem;
    line-height: 1.35;
    text-transform: none;
    letter-spacing: normal;
  }
</style>
