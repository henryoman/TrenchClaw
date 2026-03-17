<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  import { docsThemeStorageKey } from '$lib/docs';
  import type { DocHeading, DocListItem } from '$lib/docs';

  import DocsNav from './DocsNav.svelte';
  import DocsToc from './DocsToc.svelte';

  type DocsTheme = 'dark' | 'light';

  let {
    docs,
    currentSlug = null,
    toc = [],
    children,
  }: {
    docs: DocListItem[];
    currentSlug?: string | null;
    toc?: DocHeading[];
    children: Snippet;
  } = $props();

  let theme = $state<DocsTheme>('dark');
  const hasToc = $derived(toc.length > 0);
  const layoutClass = $derived(
    hasToc
      ? 'mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)_190px] lg:gap-8'
      : 'mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8',
  );

  onMount(() => {
    const storedTheme = window.localStorage.getItem(docsThemeStorageKey);
    if (storedTheme === 'dark' || storedTheme === 'light') {
      theme = storedTheme;
    }
  });

  const toggleTheme = (): void => {
    theme = theme === 'dark' ? 'light' : 'dark';
    window.localStorage.setItem(docsThemeStorageKey, theme);
  };
</script>

<div class="docs-shell min-h-screen" data-docs-theme={theme}>
  <header class="docs-header">
    <div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <a href={resolve('/', {})} class="docs-logo">TrenchClaw Docs</a>
      <nav class="flex items-center gap-3 text-sm">
        <button type="button" class="docs-theme-toggle" onclick={toggleTheme}>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <a class="docs-header-link" href={resolve('/docs', {})}>Docs Home</a>
        <a class="docs-header-link" href={resolve('/', {})}>Main Site</a>
      </nav>
    </div>
  </header>

  <main class={layoutClass}>
    <aside class="hidden lg:block">
      <DocsNav docs={docs} currentSlug={currentSlug} />
    </aside>

    <section class="min-w-0">
      {#if currentSlug !== null}
        <div class="mb-4 lg:hidden">
          <label class="mb-2 block font-mono text-[11px] uppercase tracking-[0.16em] text-muted" for="docs-mobile-nav">Navigate docs</label>
          <select
            id="docs-mobile-nav"
            class="docs-mobile-nav"
            value={currentSlug}
            onchange={(event) => {
              const target = event.currentTarget;
              if (target instanceof HTMLSelectElement) {
                window.location.href = resolve('/docs/[slug]', { slug: target.value });
              }
            }}
          >
            {#each docs as doc (doc.slug)}
              <option value={doc.slug}>{doc.title}</option>
            {/each}
          </select>
        </div>
      {/if}

      {@render children()}
    </section>

    {#if hasToc}
      <aside class="hidden lg:block">
        <DocsToc headings={toc} />
      </aside>
    {/if}
  </main>
</div>
