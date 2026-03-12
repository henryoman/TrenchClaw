<script lang="ts">
  import { resolve } from '$app/paths';
  import type { DocListItem } from '$lib/docs';

  let {
    docs,
    currentSlug = null,
  }: {
    docs: DocListItem[];
    currentSlug?: string | null;
  } = $props();
</script>

<div class="docs-sidebar">
  <p class="docs-sidebar-label">Docs</p>
  <nav class="mt-2">
    {#each docs as doc (doc.slug)}
      <a
        class={`docs-nav-link ${doc.slug === currentSlug ? 'docs-nav-link-active' : ''}`}
        href={resolve('/docs/[slug]', { slug: doc.slug })}
        aria-current={doc.slug === currentSlug ? 'page' : undefined}
      >
        {doc.title}
      </a>
    {/each}
  </nav>
</div>
