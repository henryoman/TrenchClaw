<script lang="ts">
  import type { GuiQueueJobView } from "@trenchclaw/types";
  import RetroPanel from "../ui/RetroPanel.svelte";
  import RetroTable from "../ui/RetroTable.svelte";

  export let jobs: GuiQueueJobView[] = [];
</script>

<RetroPanel title="Queue">
  <RetroTable>
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
  </RetroTable>
</RetroPanel>
