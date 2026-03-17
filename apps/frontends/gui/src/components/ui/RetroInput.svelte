<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let value = "";
  export let placeholder = "";
  export let disabled = false;

  const dispatch = createEventDispatcher<{
    valueInput: { value: string };
    valueChange: { value: string };
    valueBlur: { value: string };
  }>();
</script>

<input
  bind:value
  {placeholder}
  {disabled}
  class="retro-input"
  on:input={(event) => {
    const nextValue = (event.currentTarget as HTMLInputElement).value;
    value = nextValue;
    dispatch("valueInput", { value: nextValue });
  }}
  on:change={(event) => {
    const nextValue = (event.currentTarget as HTMLInputElement).value;
    value = nextValue;
    dispatch("valueChange", { value: nextValue });
  }}
  on:blur={() => {
    dispatch("valueBlur", { value });
  }}
/>

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
