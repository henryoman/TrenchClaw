<script lang="ts">
  export let value = "";
  export let disabled = false;
</script>

<div class="retro-select-wrap">
  <select bind:value {disabled} class="retro-select" on:change>
    <slot />
  </select>
  <span class="retro-select-chevron" aria-hidden="true">
    <svg viewBox="0 0 12 8" focusable="false">
      <path d="M1 1L6 6L11 1" />
    </svg>
  </span>
</div>

<style>
  .retro-select-wrap {
    position: relative;
    width: 100%;
    min-width: 0;
  }

  .retro-select {
    width: 100%;
    border: var(--tc-border-muted);
    background: var(--tc-color-black);
    color: var(--tc-color-gray-3);
    padding: var(--tc-control-padding-y) var(--tc-select-padding-right) var(--tc-control-padding-y)
      var(--tc-control-padding-x);
    font-size: var(--tc-control-font-size);
    min-width: 0;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
  }

  .retro-select:focus {
    border-color: var(--tc-color-turquoise);
  }

  .retro-select-chevron {
    position: absolute;
    top: 50%;
    right: var(--tc-control-padding-x);
    display: inline-flex;
    width: 12px;
    height: 8px;
    pointer-events: none;
    transform: translateY(-50%);
  }

  .retro-select-chevron svg {
    width: 100%;
    height: 100%;
    stroke: var(--tc-color-gray-3);
    stroke-width: 1.5;
    fill: none;
    stroke-linecap: square;
  }

  .retro-select:disabled + .retro-select-chevron svg {
    stroke: var(--tc-color-gray-1);
  }

  :global(.retro-select option) {
    padding: var(--tc-select-option-padding-y) var(--tc-select-option-padding-x);
  }
</style>
