<script lang="ts">
  export let kicker = "";
  export let title = "";
</script>

<div class="retro-section-header">
  {#if kicker}
    <p class="kicker">{kicker}</p>
  {/if}
  {#if title}
    <h2>{title}</h2>
  {/if}
  <slot />
</div>

<style>
  .retro-section-header {
    min-width: 0;
  }

  .kicker {
    margin: 0;
    color: var(--tc-color-gray-2);
    font-size: var(--tc-kicker-size);
    text-transform: uppercase;
    letter-spacing: var(--tc-kicker-letter-spacing);
  }

  h2 {
    margin: var(--tc-space-1) 0 0;
    font-size: var(--tc-title-size);
    text-transform: uppercase;
    letter-spacing: var(--tc-title-letter-spacing);
  }
</style>
