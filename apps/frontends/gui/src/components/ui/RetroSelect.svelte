<script lang="ts">
  export let value = "";
  export let disabled = false;
  export let chevronColor = "var(--tc-color-gray-3)";
  export let disabledChevronColor = "var(--tc-color-gray-1)";
  export let indicatorShape: "chevron" | "triangle" = "chevron";
</script>

<div
  class="retro-select-wrap"
  style={`--retro-select-chevron-color: ${chevronColor}; --retro-select-chevron-disabled-color: ${disabledChevronColor};`}
>
  <select bind:value {disabled} class="retro-select" on:change>
    <slot />
  </select>
  <span class="retro-select-chevron" aria-hidden="true">
    {#if indicatorShape === "triangle"}
      <svg class="indicator-svg triangle" viewBox="0 0 10 6" focusable="false">
        <path d="M0 0H10L5 6Z" />
      </svg>
    {:else}
      <svg class="indicator-svg chevron" viewBox="0 0 12 8" focusable="false">
        <path d="M1 1L6 6L11 1" />
      </svg>
    {/if}
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
    background: var(--tc-color-black-2);
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

  .indicator-svg {
    width: 100%;
    height: 100%;
  }

  .indicator-svg.chevron path {
    stroke: var(--retro-select-chevron-color);
    stroke-width: 1.5;
    fill: none;
    stroke-linecap: square;
  }

  .indicator-svg.triangle path {
    fill: var(--retro-select-chevron-color);
  }

  .retro-select:disabled + .retro-select-chevron .indicator-svg.chevron path {
    stroke: var(--retro-select-chevron-disabled-color);
  }

  .retro-select:disabled + .retro-select-chevron .indicator-svg.triangle path {
    fill: var(--retro-select-chevron-disabled-color);
  }

  :global(.retro-select option) {
    padding: var(--tc-select-option-padding-y) var(--tc-select-option-padding-x);
  }
</style>
