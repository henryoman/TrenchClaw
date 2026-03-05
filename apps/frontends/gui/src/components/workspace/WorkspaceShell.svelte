<script lang="ts">
  import Sidebar from "./Sidebar.svelte";

  export let runtimeStatus = "";
  export let appVersion = "";
  export let activeTab: "chat" | "keys-secrets" | "wallets" = "chat";
  export let onTabChange: (tab: "chat" | "keys-secrets" | "wallets") => void;
</script>

<main class="layout">
  <Sidebar {runtimeStatus} {appVersion} {activeTab} {onTabChange} />
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
