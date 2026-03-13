<script lang="ts">
  import Sidebar from "./Sidebar.svelte";

  export let runtimeStatus = "";
  export let appVersion = "";
  export let instanceName = "";
  export let activeTab: "chat" | "keys" | "settings" | "wallets" | "schedule" = "chat";
  export let onTabChange: (tab: "chat" | "keys" | "settings" | "wallets" | "schedule") => void;
</script>

<main class="layout">
  <Sidebar {runtimeStatus} {appVersion} {instanceName} {activeTab} {onTabChange} />
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
    gap: var(--tc-space-2);
    padding: var(--tc-space-2);
    box-sizing: border-box;
  }

  .workspace {
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr;
    gap: var(--tc-space-2);
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
