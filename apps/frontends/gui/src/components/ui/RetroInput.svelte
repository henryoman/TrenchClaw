<script lang="ts">
  export let value = "";
  export let placeholder = "";
  export let disabled = false;
</script>

<input bind:value {placeholder} {disabled} class="retro-input" on:input on:change on:blur />

<style>
  .retro-input {
    width: 100%;
    border: var(--tc-border-muted);
    background: var(--tc-color-black-2);
    color: var(--tc-color-gray-3);
    padding: var(--tc-control-padding-y) var(--tc-control-padding-x);
    font-size: var(--tc-control-font-size);
    min-width: 0;
  }

  .retro-input:focus {
    border-color: var(--tc-color-turquoise);
  }
</style>
