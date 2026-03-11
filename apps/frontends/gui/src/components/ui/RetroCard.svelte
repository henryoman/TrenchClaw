<script lang="ts">
  export let center = false;
</script>

<section class={`retro-card ${center ? "center" : ""}`}>
  <slot />
</section>

<style>
  .retro-card {
    border: var(--tc-border);
    background: var(--tc-color-black-2);
    padding: var(--tc-space-5);
  }

  .retro-card.center {
    text-align: center;
    display: grid;
    justify-items: center;
    gap: var(--tc-space-3);
  }
</style>
