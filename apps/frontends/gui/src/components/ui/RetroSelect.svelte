<script lang="ts">
  export let value = "";
  export let disabled = false;
</script>

<select bind:value {disabled} class="retro-select">
  <slot />
</select>

<style>
  .retro-select {
    width: 100%;
    border: var(--tc-border-muted);
    background: var(--tc-color-black);
    color: var(--tc-color-gray-3);
    padding: var(--tc-control-padding-y) var(--tc-control-padding-x);
    font-size: var(--tc-control-font-size);
    min-width: 0;
  }

  .retro-select:focus {
    border-color: var(--tc-color-turquoise);
  }
</style>
