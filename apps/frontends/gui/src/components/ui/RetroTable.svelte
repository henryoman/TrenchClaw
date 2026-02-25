<table class="retro-table">
  <slot />
</table>

<style>
  .retro-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  .retro-table :global(th),
  .retro-table :global(td) {
    border: var(--tc-border-muted);
    padding: 6px 8px;
    text-align: left;
  }

  .retro-table :global(th) {
    color: var(--tc-color-turquoise);
    background: #111025;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.74rem;
  }
</style>
