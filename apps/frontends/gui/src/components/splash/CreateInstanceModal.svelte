<script lang="ts">
  import RetroButton from "../ui/RetroButton.svelte";
  import RetroField from "../ui/RetroField.svelte";
  import RetroInput from "../ui/RetroInput.svelte";
  import RetroModal from "../ui/RetroModal.svelte";

  export let name = "";
  export let busy = false;
  export let onCancel: () => void;
  export let onCreate: () => void;
</script>

<RetroModal title="Create New Instance">
  <RetroField label="Instance Name">
    <RetroInput bind:value={name} placeholder="e.g. Alpha Desk" />
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
</style>
