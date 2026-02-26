<script lang="ts">
  export let runtimeStatus = "";
</script>

<main class="loading-shell">
  <div class="loading-card">
    <span>Connecting to runtime...</span>
    {#if runtimeStatus}
      <span class="status">{runtimeStatus}</span>
    {/if}
  </div>
</main>

<style>
  .loading-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: var(--tc-space-4);
  }

  .loading-card {
    border: var(--tc-border);
    background: var(--tc-color-black-2);
    color: var(--tc-color-turquoise);
    padding: var(--tc-space-4);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.82rem;
    display: flex;
    flex-direction: column;
    gap: var(--tc-space-2);
  }

  .status {
    color: var(--tc-color-gray-1);
    font-size: 0.75rem;
  }
</style>
