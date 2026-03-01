<script lang="ts">
  export let runtimeStatus = "";
  export let activeTab: "chat" | "keys-secrets" = "chat";
  export let onTabChange: (tab: "chat" | "keys-secrets") => void;

  const getSidebarStatus = (status: string): string => {
    const runtimeMatch = /^runtime:\s*([^|]+?)(?:\s*\|.*)?$/i.exec(status.trim());
    if (runtimeMatch) {
      return `mode:\n${runtimeMatch[1].trim()}`;
    }

    return status;
  };

  const getSidebarLiveStatus = (status: string): string => {
    const normalized = status.trim().toLowerCase();
    if (normalized.includes("offline")) {
      return "status: offline";
    }
    if (normalized.includes("checking")) {
      return "status: checking";
    }

    return "status: live";
  };
</script>

<aside class="sidebar">
  <p class="instance">trenchclaw</p>
  <nav class="tabs" aria-label="Workspace tabs">
    <button
      type="button"
      class="tab-button {activeTab === 'chat' ? 'active' : ''}"
      on:click={() => {
        onTabChange("chat");
      }}>Chat</button
    >
    <button
      type="button"
      class="tab-button {activeTab === 'keys-secrets' ? 'active' : ''}"
      on:click={() => {
        onTabChange("keys-secrets");
      }}>Keys & Secrets</button
    >
  </nav>
  <div class="status-stack">
    <p class="status">{getSidebarStatus(runtimeStatus)}</p>
    <p class="status live-status">{getSidebarLiveStatus(runtimeStatus)}</p>
  </div>
</aside>

<style>
  .sidebar {
    border: var(--tc-border);
    background: var(--tc-color-black);
    padding: var(--tc-space-3);
    display: flex;
    flex-direction: column;
    gap: var(--tc-space-2);
    min-width: var(--tc-sidebar-width);
  }

  .tabs {
    display: flex;
    flex-direction: column;
    gap: var(--tc-space-2);
  }

  .tab-button {
    border: var(--tc-border-muted);
    background: transparent;
    color: var(--tc-color-gray-1);
    padding: var(--tc-space-2);
    font-family: inherit;
    font-size: var(--tc-sidebar-label-size);
    text-transform: uppercase;
    letter-spacing: var(--tc-sidebar-letter-spacing);
    text-align: left;
    cursor: pointer;
  }

  .tab-button.active {
    border-color: var(--tc-color-turquoise);
    color: var(--tc-color-turquoise);
  }

  .instance {
    margin: 0;
    color: var(--tc-color-gray-3);
    font-size: var(--tc-sidebar-title-size);
    text-transform: uppercase;
  }

  .status-stack {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: var(--tc-space-2);
  }

  .status {
    border: var(--tc-border-muted);
    padding: var(--tc-space-2);
    color: var(--tc-color-gray-1);
    font-size: var(--tc-sidebar-label-size);
    text-transform: uppercase;
    line-height: 1.35;
  }

  .live-status {
    margin: 0;
  }
</style>
