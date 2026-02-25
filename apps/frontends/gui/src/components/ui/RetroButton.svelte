<script lang="ts">
  export let type: "button" | "submit" = "button";
  export let disabled = false;
  export let variant: "primary" | "secondary" | "danger" = "primary";
  export let block = false;
</script>

<button type={type} disabled={disabled} class={`retro-btn ${variant} ${block ? "block" : ""}`} on:click>
  <slot />
</button>

<style>
  .retro-btn {
    border: var(--tc-border);
    background: var(--tc-color-purple-2);
    color: var(--tc-color-turquoise);
    padding: 10px 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    cursor: pointer;
    border-radius: 0;
    box-shadow: none;
  }

  .retro-btn.block {
    width: 100%;
  }

  .retro-btn.secondary {
    border: var(--tc-border-muted);
    color: var(--tc-color-gray-3);
    background: transparent;
  }

  .retro-btn.danger {
    border-color: var(--tc-color-red);
    color: var(--tc-color-red);
    background: transparent;
  }

  .retro-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .retro-btn:not(:disabled):hover {
    background: var(--tc-color-purple);
  }
</style>
