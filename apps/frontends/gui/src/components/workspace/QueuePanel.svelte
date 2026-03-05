<script lang="ts">
  import type { GuiQueueJobView } from "@trenchclaw/types";
  import RetroPanel from "../ui/RetroPanel.svelte";

  export let jobs: GuiQueueJobView[] = [];
</script>

<RetroPanel title="Queue">
  <table class="retro-table">
    <thead>
      <tr>
        <th>Status</th>
        <th>Bot</th>
        <th>Routine</th>
        <th>Cycles</th>
      </tr>
    </thead>
    <tbody>
      {#if jobs.length === 0}
        <tr>
          <td colspan="4">No jobs queued.</td>
        </tr>
      {:else}
        {#each jobs as job}
          <tr>
            <td>{job.status}</td>
            <td>{job.botId}</td>
            <td>{job.routineName}</td>
            <td>{job.cyclesCompleted}</td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</RetroPanel>

<style>
  .retro-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: var(--tc-type-sm);
  }

  .retro-table th,
  .retro-table td {
    border: var(--tc-border-muted);
    padding: var(--tc-space-2);
    text-align: left;
    overflow-wrap: anywhere;
  }

  .retro-table th {
    color: var(--tc-color-turquoise);
    background: var(--tc-color-black);
    text-transform: uppercase;
    letter-spacing: var(--tc-track-normal);
    font-size: var(--tc-type-xs);
  }
</style>
