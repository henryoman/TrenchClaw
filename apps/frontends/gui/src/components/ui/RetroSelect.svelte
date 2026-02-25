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
    background: var(--tc-color-black-2);
    color: var(--tc-color-gray-3);
    padding: 10px 11px;
  }

  .retro-select:focus {
    border-color: var(--tc-color-turquoise);
  }
</style>
