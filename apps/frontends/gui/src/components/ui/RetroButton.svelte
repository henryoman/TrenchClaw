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
    background: var(--tc-color-black-2);
    color: var(--tc-color-gray-3);
    padding: var(--tc-button-padding-y) var(--tc-button-padding-x);
    font-size: var(--tc-button-font-size);
    text-transform: uppercase;
    letter-spacing: var(--tc-button-letter-spacing);
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
    background: var(--tc-color-black-2);
  }

  .retro-btn.danger {
    border-color: var(--tc-color-red);
    color: var(--tc-color-red);
    background: var(--tc-color-black-2);
  }

  .retro-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .retro-btn:not(:disabled):hover {
    border-color: var(--tc-color-turquoise);
    color: var(--tc-color-turquoise);
    background: var(--tc-color-black-2);
  }
</style>
