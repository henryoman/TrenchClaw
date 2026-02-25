<script lang="ts">
  export let center = false;
</script>

<section class={`retro-card ${center ? "center" : ""}`}>
  <slot />
</section>

<style>
  .retro-card {
    border: var(--tc-border);
    background: linear-gradient(180deg, #120a1f 0%, #0a0711 100%);
    padding: var(--tc-space-5);
  }

  .retro-card.center {
    text-align: center;
    display: grid;
    justify-items: center;
    gap: var(--tc-space-3);
  }
</style>
