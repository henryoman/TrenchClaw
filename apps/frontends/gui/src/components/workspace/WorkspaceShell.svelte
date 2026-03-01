<script lang="ts">
  import Sidebar from "./Sidebar.svelte";

  export let runtimeStatus = "";
  export let activeTab: "chat" | "keys-secrets" = "chat";
  export let onTabChange: (tab: "chat" | "keys-secrets") => void;
</script>

<main class="layout">
  <Sidebar {runtimeStatus} {activeTab} {onTabChange} />
  <section class="workspace">
    <slot />
  </section>
</main>

<style>
  .layout {
    height: 100%;
    display: grid;
    grid-template-columns: var(--tc-sidebar-width) 1fr;
    grid-template-rows: 1fr;
    gap: var(--tc-space-3);
    padding: var(--tc-space-3);
    box-sizing: border-box;
  }

  .workspace {
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr;
    gap: var(--tc-space-3);
  }

  @media (max-width: var(--tc-layout-breakpoint)) {
    .layout {
      grid-template-columns: 1fr;
    }

    .workspace {
      grid-template-columns: 1fr;
    }
  }
</style>
