<script lang="ts">
  type SidebarTab = "chat" | "config" | "wallets" | "schedule";
  type SidebarProps = {
    runtimeStatus?: string;
    appVersion?: string;
    instanceName?: string;
    activeTab?: SidebarTab;
    onTabChange: (tab: SidebarTab) => void;
  };

  let {
    runtimeStatus = "",
    appVersion = "",
    instanceName = "",
    activeTab = "chat",
    onTabChange,
  }: SidebarProps = $props();

  const getSidebarLiveStatus = (status: string): string => {
    const normalized = status.trim().toLowerCase();
    if (normalized.includes("offline")) {
      return "Not connected";
    }

    return "Connected";
  };
</script>

<aside class="sidebar">
  <div class="sidebar-head">
    <p class="instance">{instanceName || "trenchclaw"}</p>
    <p class="version">{appVersion}</p>
  </div>
  <nav class="tabs" aria-label="Workspace tabs">
    <button
      type="button"
      class="tab-button {activeTab === 'chat' ? 'active' : ''}"
      onclick={() => {
        onTabChange("chat");
      }}>Chat</button
    >
    <button
      type="button"
      class="tab-button {activeTab === 'config' ? 'active' : ''}"
      onclick={() => {
        onTabChange("config");
      }}>Config</button
    >
    <button
      type="button"
      class="tab-button {activeTab === 'wallets' ? 'active' : ''}"
      onclick={() => {
        onTabChange("wallets");
      }}>Wallets</button
    >
    <button
      type="button"
      class="tab-button {activeTab === 'schedule' ? 'active' : ''}"
      onclick={() => {
        onTabChange("schedule");
      }}>Schedule</button
    >
  </nav>
  <div class="status-stack">
    <p class="status">Mode: {getSidebarLiveStatus(runtimeStatus)}</p>
    <p class="brand">TRENCHCLAW</p>
  </div>
</aside>

<style>
  .sidebar {
    border: 1px solid var(--tc-color-border);
    background: var(--tc-color-black-2);
    padding: var(--tc-space-2) 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: var(--tc-sidebar-width);
  }

  .sidebar-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 var(--tc-space-2) var(--tc-space-2);
  }

  .tabs {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .tab-button {
    border: 0;
    border-top: 1px solid var(--tc-color-gray-2);
    background: transparent;
    color: var(--tc-color-gray-1);
    padding: 6px var(--tc-space-2);
    font-family: inherit;
    font-size: var(--tc-sidebar-label-size);
    text-transform: uppercase;
    letter-spacing: var(--tc-sidebar-letter-spacing);
    text-align: left;
    cursor: pointer;
  }

  .tab-button:last-child {
    border-bottom: 1px solid var(--tc-color-gray-2);
  }

  .tab-button.active {
    color: var(--tc-color-lime);
  }

  .instance {
    margin: 0;
    color: var(--tc-color-gray-3);
    font-size: var(--tc-sidebar-title-size);
    text-transform: uppercase;
  }

  .version {
    margin: 0;
    color: var(--tc-color-gray-2);
    font-size: 9px;
    line-height: 1;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status-stack {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    border-top: 1px solid var(--tc-color-gray-2);
    padding: var(--tc-space-2) var(--tc-space-2) 0;
  }

  .status {
    margin: 0;
    padding: 0;
    color: var(--tc-color-gray-1);
    font-size: var(--tc-sidebar-label-size);
    text-transform: uppercase;
    line-height: 1.35;
  }

  .brand {
    margin: 0;
    color: var(--tc-color-gray-3);
    font-size: var(--tc-sidebar-title-size);
    font-weight: 700;
    text-transform: uppercase;
  }

  @media (max-width: var(--tc-layout-breakpoint)) {
    .sidebar {
      min-width: 0;
    }
  }
</style>
