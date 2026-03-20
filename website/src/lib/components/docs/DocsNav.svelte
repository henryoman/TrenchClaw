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
  const showReference = $derived(currentSlug === 'architecture' && sections.reference.length > 0);
</script>

<div class="docs-sidebar">
  <nav>
    <a
      class={`docs-nav-link ${currentSlug === null ? 'docs-nav-link-active' : ''}`}
      href={resolve('/docs', {})}
      aria-current={currentSlug === null ? 'page' : undefined}
    >
      Home
    </a>
  </nav>

  <p class="docs-sidebar-label">Setup</p>
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

  {#if showReference}
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
