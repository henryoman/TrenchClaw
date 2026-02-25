<script lang="ts">
  import RetroButton from "../ui/RetroButton.svelte";
  import RetroCard from "../ui/RetroCard.svelte";

  export let runtimeStatus = "";
  export let error = "";
  export let onCreate: () => void;
</script>

<main class="splash-shell">
  <RetroCard center={true}>
    <h1>TrenchClaw</h1>
    <RetroButton on:click={onCreate}>Create New Instance</RetroButton>
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
    margin: 0;
    color: var(--tc-color-turquoise);
    font-family: var(--tc-font-display);
    font-size: 1rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .error {
    margin: 0;
    color: var(--tc-color-red);
    font-size: 0.84rem;
  }

  .runtime {
    margin: 0;
    color: var(--tc-color-gray-1);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>
