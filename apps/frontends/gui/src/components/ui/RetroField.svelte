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
    gap: 6px;
    color: var(--tc-color-gray-1);
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  span {
    color: var(--tc-color-gray-1);
  }
</style>
