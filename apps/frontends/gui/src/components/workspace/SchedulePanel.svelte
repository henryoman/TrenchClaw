<script lang="ts">
  import type { GuiScheduleJobView } from "@trenchclaw/types";

  export let jobs: GuiScheduleJobView[] = [];

  const formatScheduleTime = (unixMs: number): string =>
    new Date(unixMs).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const formatInterval = (intervalMs: number | null): string => {
    if (intervalMs === null || intervalMs <= 0) {
      return "One-time";
    }
    if (intervalMs < 1_000) {
      return `${intervalMs}ms`;
    }
    if (intervalMs % 3_600_000 === 0) {
      return `${intervalMs / 3_600_000}h`;
    }
    if (intervalMs % 60_000 === 0) {
      return `${intervalMs / 60_000}m`;
    }
    if (intervalMs % 1_000 === 0) {
      return `${intervalMs / 1_000}s`;
    }
    return `${intervalMs}ms`;
  };

  const formatCycle = (job: GuiScheduleJobView): string => {
    if (job.totalCycles === null) {
      return job.recurring ? "Loop" : `${job.cyclesCompleted}`;
    }
    return `${job.cyclesCompleted}/${job.totalCycles}`;
  };
</script>

<section class="schedule-panel">
  <header class="panel-header">Schedule</header>
  <table class="retro-table">
    <thead>
      <tr>
        <th>Status</th>
        <th>Routine</th>
        <th>Next</th>
        <th>Repeat</th>
        <th>Cycles</th>
      </tr>
    </thead>
    <tbody>
      {#if jobs.length === 0}
        <tr>
          <td colspan="5">No scheduled jobs.</td>
        </tr>
      {:else}
        {#each jobs as job (job.serialNumber ?? job.id)}
          <tr>
            <td>{job.status}</td>
            <td>
              <div class="routine-cell">
                <span>{job.routineName}</span>
                <small>{job.botId}</small>
              </div>
            </td>
            <td>{job.nextRunAt ? formatScheduleTime(job.nextRunAt) : "Paused"}</td>
            <td>{formatInterval(job.intervalMs)}</td>
            <td>{formatCycle(job)}</td>
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
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.86rem;
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--tc-color-black-2);
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
