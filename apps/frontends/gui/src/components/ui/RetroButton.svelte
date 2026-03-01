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
    background: var(--tc-color-black);
    color: var(--tc-color-gray-3);
    padding: var(--tc-control-padding-y) var(--tc-control-padding-x);
    font-size: var(--tc-control-font-size);
    text-transform: uppercase;
    letter-spacing: var(--tc-control-letter-spacing);
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
    background: var(--tc-color-black);
  }

  .retro-btn.danger {
    border-color: var(--tc-color-red);
    color: var(--tc-color-red);
    background: var(--tc-color-black);
  }

  .retro-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .retro-btn:not(:disabled):hover {
    border-color: var(--tc-color-turquoise);
    color: var(--tc-color-turquoise);
    background: var(--tc-color-black);
  }
</style>
