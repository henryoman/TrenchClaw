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
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  .retro-table th,
  .retro-table td {
    border: var(--tc-border-muted);
    padding: 6px 8px;
    text-align: left;
  }

  .retro-table th {
    color: var(--tc-color-turquoise);
    background: #111025;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.74rem;
  }
</style>
