<script lang="ts">
  import type { DocHeading } from '$lib/docs';

  let { headings }: { headings: DocHeading[] } = $props();
</script>

{#if headings.length > 0}
  <div class="docs-toc">
    <p class="docs-sidebar-label">On this page</p>
    <nav class="mt-3">
      {#each headings as heading (`${heading.level}-${heading.id}`)}
        <a
          class={`docs-toc-link ${heading.level === 3 ? 'docs-toc-link-nested' : ''}`}
          href={`#${heading.id}`}
        >
          {heading.text}
        </a>
      {/each}
    </nav>
  </div>
{/if}
