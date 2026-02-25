<script lang="ts">
  export let instanceName = "operator";
  export let runtimeStatus = "";
</script>

<aside class="sidebar">
  <h1>TC</h1>
  <p class="instance">{instanceName}</p>
  <p class="status">{runtimeStatus}</p>
</aside>

<style>
  .sidebar {
    border-right: var(--tc-border);
    background: var(--tc-color-black);
    padding: var(--tc-space-3);
    display: flex;
    flex-direction: column;
    gap: var(--tc-space-2);
    min-width: 110px;
  }

  h1 {
    margin: 0;
    color: var(--tc-color-turquoise);
    font-family: var(--tc-font-display);
    font-size: 0.78rem;
    letter-spacing: 0.1em;
  }

  .instance {
    margin: 0;
    color: var(--tc-color-gray-3);
    font-size: 0.72rem;
    text-transform: uppercase;
  }

  .status {
    margin: auto 0 0 0;
    border: var(--tc-border-muted);
    padding: var(--tc-space-2);
    color: var(--tc-color-gray-1);
    font-size: 0.68rem;
    text-transform: uppercase;
    line-height: 1.35;
  }
</style>
