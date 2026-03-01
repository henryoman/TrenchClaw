<script lang="ts">
  export let label = "";
</script>

<label class="retro-field">
  <span>{label}</span>
  <slot />
</label>

<style>
  .retro-field {
    display: grid;
    gap: var(--tc-field-gap);
    color: var(--tc-color-gray-1);
    font-size: var(--tc-field-label-size);
    text-transform: uppercase;
    letter-spacing: var(--tc-field-label-letter-spacing);
  }

  span {
    color: var(--tc-color-gray-1);
  }
</style>
