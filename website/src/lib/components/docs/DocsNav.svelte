<script lang="ts">
  import { resolve } from '$app/paths';
  import { splitDocsBySection, type DocListItem } from '$lib/docs';

  let {
    docs,
    currentSlug = null,
  }: {
    docs: DocListItem[];
    currentSlug?: string | null;
  } = $props();

  const sections = $derived(splitDocsBySection(docs));
</script>

<div class="docs-sidebar">
  <p class="docs-sidebar-label">Beta guides</p>
  <nav class="mt-2">
    {#each sections.primary as doc (doc.slug)}
      <a
        class={`docs-nav-link ${doc.slug === currentSlug ? 'docs-nav-link-active' : ''}`}
        href={resolve('/docs/[slug]', { slug: doc.slug })}
        aria-current={doc.slug === currentSlug ? 'page' : undefined}
      >
        {doc.title}
      </a>
    {/each}
  </nav>

  {#if sections.reference.length > 0}
    <p class="docs-sidebar-label mt-5">Reference</p>
    <nav class="mt-2">
      {#each sections.reference as doc (doc.slug)}
        <a
          class={`docs-nav-link ${doc.slug === currentSlug ? 'docs-nav-link-active' : ''}`}
          href={resolve('/docs/[slug]', { slug: doc.slug })}
          aria-current={doc.slug === currentSlug ? 'page' : undefined}
        >
          {doc.title}
        </a>
      {/each}
    </nav>
  {/if}
</div>
