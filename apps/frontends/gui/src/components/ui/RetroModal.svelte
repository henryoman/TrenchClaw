<script lang="ts">
  export let title = "";
</script>

<div class="retro-modal-backdrop" role="presentation">
  <div class="retro-modal" role="dialog" aria-modal="true" aria-label={title}>
    {#if title}
      <h2>{title}</h2>
    {/if}
    <slot />
  </div>
</div>

<style>
  .retro-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.94);
    display: grid;
    place-items: center;
    padding: var(--tc-space-4);
    z-index: 20;
  }

  .retro-modal {
    width: min(480px, 100%);
    border: var(--tc-border);
    background: var(--tc-color-black);
    padding: var(--tc-space-4);
    display: grid;
    gap: var(--tc-space-3);
  }

  h2 {
    margin: 0;
    color: var(--tc-color-turquoise);
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
</style>
