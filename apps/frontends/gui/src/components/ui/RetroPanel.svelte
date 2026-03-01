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
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr;
  }

  header {
    border-bottom: var(--tc-border-muted);
    color: var(--tc-color-turquoise);
    padding: var(--tc-panel-header-padding-y) var(--tc-panel-header-padding-x);
    text-transform: uppercase;
    letter-spacing: var(--tc-panel-header-letter-spacing);
    font-size: var(--tc-panel-header-size);
  }

  .content {
    min-height: 0;
    padding: var(--tc-panel-content-padding);
    overflow: auto;
    display: flex;
    flex-direction: column;
  }
</style>
