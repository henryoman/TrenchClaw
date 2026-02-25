<script lang="ts">
  export let title = "";
</script>

<section class="retro-panel">
  <header>{title}</header>
  <div class="content"><slot /></div>
</section>

<style>
  .retro-panel {
    border: var(--tc-border);
    background: var(--tc-color-black);
    min-height: 0;
    display: grid;
    grid-template-rows: auto 1fr;
  }

  header {
    border-bottom: var(--tc-border-muted);
    color: var(--tc-color-turquoise);
    padding: 10px 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.86rem;
  }

  .content {
    min-height: 0;
    padding: 10px;
    overflow: auto;
  }
</style>
