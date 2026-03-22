<script lang="ts">
  import type { GuiScheduleJobView, GuiWakeupSettingsView } from "@trenchclaw/types";
  import { buildScheduleDisplayRows } from "./schedule-display";

  type SchedulePanelProps = {
    jobs?: GuiScheduleJobView[];
    wakeupSettings?: GuiWakeupSettingsView | null;
  };

  let { jobs = [], wakeupSettings = null }: SchedulePanelProps = $props();

  const displayRows = $derived(buildScheduleDisplayRows({ jobs, wakeupSettings }));

  const formatScheduleTime = (unixMs: number): string =>
    new Date(unixMs).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
</script>

<section class="schedule-panel">
  <header class="panel-header">
    <span>Schedule</span>
    <small>(read only)</small>
  </header>
  <table class="retro-table">
    <thead>
      <tr>
        <th>Status</th>
        <th>Routine</th>
        <th>Next</th>
      </tr>
    </thead>
    <tbody>
      {#if displayRows.length === 0}
        <tr>
          <td colspan="3">No scheduled jobs.</td>
        </tr>
      {:else}
        {#each displayRows as row (row.id)}
          <tr>
            <td>{row.status}</td>
            <td>
              <div class="routine-cell">
                <span>{row.routineName}</span>
                {#if row.botId}
                  <small>{row.botId}</small>
                {/if}
              </div>
            </td>
            <td>{row.nextRunAt ? formatScheduleTime(row.nextRunAt) : "Paused"}</td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</section>

<style>
  .schedule-panel {
    border: var(--tc-border);
    background: var(--tc-color-black-2);
    min-height: 0;
    height: 100%;
    overflow: auto;
  }

  .panel-header {
    border-bottom: var(--tc-border-muted);
    color: var(--tc-color-turquoise);
    padding: 10px 12px;
    font-size: 0.86rem;
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--tc-color-black-2);
    display: flex;
    align-items: baseline;
    gap: 8px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .panel-header small {
    color: var(--tc-color-gray-2);
    font-size: var(--tc-type-xs);
    letter-spacing: normal;
    text-transform: none;
  }

  .retro-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: var(--tc-type-sm);
  }

  .retro-table th,
  .retro-table td {
    border-right: var(--tc-border-muted);
    border-bottom: var(--tc-border-muted);
    padding: var(--tc-space-2);
    text-align: left;
    overflow-wrap: anywhere;
    vertical-align: top;
  }

  .retro-table th:last-child,
  .retro-table td:last-child {
    border-right: 0;
  }

  .retro-table tbody tr:last-child td {
    border-bottom: 0;
  }

  .retro-table th {
    color: var(--tc-color-turquoise);
    background: var(--tc-color-black-2);
    text-transform: uppercase;
    letter-spacing: var(--tc-track-normal);
    font-size: var(--tc-type-xs);
    position: sticky;
    top: 40px;
    z-index: 1;
  }

  .routine-cell {
    display: grid;
    gap: 2px;
  }

  .routine-cell small {
    color: var(--tc-color-gray-2);
    font-size: var(--tc-type-xs);
  }
</style>
