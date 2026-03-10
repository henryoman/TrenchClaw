<script lang="ts">
  import RetroButton from "../ui/RetroButton.svelte";
  import RetroCard from "../ui/RetroCard.svelte";

  export let runtimeStatus = "";
  export let error = "";
  export let busy = false;
  export let onRetry: () => void;
  export let onCreate: () => void;
  export let onLogin: () => void;
</script>

<main class="splash-shell">
  <RetroCard center={true}>
    <h1>TrenchClaw</h1>
    <p class="tagline">Choose an instance to continue</p>
    <div class="actions">
      <RetroButton disabled={busy} on:click={onCreate}>Create instance</RetroButton>
      <RetroButton variant="secondary" disabled={busy} on:click={onLogin}>Log In</RetroButton>
      <RetroButton variant="secondary" disabled={busy} on:click={onRetry}>
        {busy ? "Connecting..." : "Retry connection"}
      </RetroButton>
    </div>
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

  .tagline {
    margin: 0;
    color: var(--tc-color-gray-1);
    font-size: 0.8rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .actions {
    display: grid;
    width: min(320px, 100%);
    gap: var(--tc-space-2);
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
