<script lang="ts">
  import Sidebar from "./Sidebar.svelte";

  export let instanceName = "operator";
  export let runtimeStatus = "";
</script>

<main class="layout">
  <Sidebar {instanceName} {runtimeStatus} />
  <section class="workspace">
    <slot />
  </section>
</main>

<style>
  .layout {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 110px 1fr;
  }

  .workspace {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--tc-space-3);
    padding: var(--tc-space-3);
  }

  @media (max-width: 980px) {
    .layout {
      grid-template-columns: 1fr;
    }

    .workspace {
      grid-template-columns: 1fr;
    }
  }
</style>
