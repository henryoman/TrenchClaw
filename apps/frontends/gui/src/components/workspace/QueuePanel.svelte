<script lang="ts">
  import type { GuiQueueJobView } from "@trenchclaw/types";

  export let jobs: GuiQueueJobView[] = [];

  const formatQueueTime = (unixMs: number): string =>
    new Date(unixMs).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
</script>

<section class="queue-panel">
  <table class="retro-table">
    <thead>
      <tr>
        <th>Status</th>
        <th>Bot</th>
        <th>Routine</th>
        <th>Queued</th>
        <th>Cycles</th>
      </tr>
    </thead>
    <tbody>
      {#if jobs.length === 0}
        <tr>
          <td colspan="5">No jobs queued.</td>
        </tr>
      {:else}
        {#each jobs as job (job.serialNumber ?? job.id)}
          <tr>
            <td>{job.status}</td>
            <td>{job.botId}</td>
            <td>{job.routineName}</td>
            <td>{formatQueueTime(job.nextRunAt ?? job.createdAt)}</td>
            <td>{job.cyclesCompleted}</td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</section>

<style>
  .queue-panel {
    border: var(--tc-border);
    background: var(--tc-color-black-2);
    min-height: 0;
    height: 100%;
    overflow: auto;
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
    top: 0;
    z-index: 1;
  }
</style>
