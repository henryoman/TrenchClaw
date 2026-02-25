<script lang="ts">
  export let value = "";
  export let placeholder = "";
  export let type: "text" | "password" = "text";
  export let disabled = false;
</script>

<input bind:value {type} {placeholder} {disabled} class="retro-input" />

<style>
  .retro-input {
    width: 100%;
    border: var(--tc-border-muted);
    background: var(--tc-color-black-2);
    color: var(--tc-color-gray-3);
    padding: 10px 11px;
  }

  .retro-input:focus {
    border-color: var(--tc-color-turquoise);
  }
</style>
