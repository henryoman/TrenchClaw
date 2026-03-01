<script lang="ts">
  export let tone: "error" | "ok" = "ok";
  export let text = "";
</script>

{#if text}
  <p class={`retro-status ${tone}`} role={tone === "error" ? "alert" : "status"} aria-live="polite">
    {text}
  </p>
{/if}

<style>
  .retro-status {
    margin: 0;
    border: var(--tc-border-muted);
    padding: var(--tc-space-2);
    font-size: var(--tc-status-font-size);
    text-transform: uppercase;
    letter-spacing: var(--tc-status-letter-spacing);
    overflow-wrap: anywhere;
  }

  .retro-status.error {
    color: var(--tc-color-red);
    border-color: var(--tc-color-red);
  }

  .retro-status.ok {
    color: var(--tc-color-turquoise);
  }
</style>
