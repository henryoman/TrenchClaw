<script lang="ts">
  import type { GuiInstanceProfileView } from "@trenchclaw/types";
  import RetroButton from "../ui/RetroButton.svelte";
  import RetroCard from "../ui/RetroCard.svelte";
  import RetroField from "../ui/RetroField.svelte";
  import RetroInput from "../ui/RetroInput.svelte";
  import RetroSelect from "../ui/RetroSelect.svelte";

  export let instances: GuiInstanceProfileView[] = [];
  export let selectedId = "";
  export let pin = "";
  export let runtimeStatus = "";
  export let error = "";
  export let busy = false;
  export let createNewOption = "__create_new__";
  export let onSubmit: () => void;
</script>

<main class="splash-shell">
  <RetroCard>
    <h1>Select Instance</h1>
    <form
      class="form"
      on:submit|preventDefault={() => {
        onSubmit();
      }}
    >
      <RetroField label="Instance">
        <RetroSelect bind:value={selectedId}>
          <option value="">Select instance...</option>
          {#each instances as instance}
            <option value={instance.localInstanceId}>{instance.name} ({instance.localInstanceId})</option>
          {/each}
          <option value={createNewOption}>Create New Instance</option>
        </RetroSelect>
      </RetroField>
      <RetroField label="Pin">
        <RetroInput bind:value={pin} placeholder="Pin if required" />
      </RetroField>
      <RetroButton type="submit" disabled={busy}>Continue</RetroButton>
    </form>
    {#if error}
      <p class="error">{error}</p>
    {/if}
    <p class="runtime">{runtimeStatus}</p>
  </RetroCard>
</main>

<style>
  .splash-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: var(--tc-space-4);
  }

  h1 {
    margin: 0 0 var(--tc-space-3) 0;
    color: var(--tc-color-turquoise);
    font-family: var(--tc-font-display);
    font-size: 0.9rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .form {
    display: grid;
    gap: var(--tc-space-3);
  }

  .error {
    margin: var(--tc-space-3) 0 0 0;
    color: var(--tc-color-red);
    font-size: 0.84rem;
  }

  .runtime {
    margin: var(--tc-space-3) 0 0 0;
    color: var(--tc-color-gray-1);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>
