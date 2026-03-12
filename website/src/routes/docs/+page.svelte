<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  type DocsTheme = 'dark' | 'light';

  const DOCS_THEME_STORAGE_KEY = 'trenchclaw-docs-theme';
  let theme = $state<DocsTheme>('dark');

  onMount(() => {
    const storedTheme = window.localStorage.getItem(DOCS_THEME_STORAGE_KEY);
    if (storedTheme === 'dark' || storedTheme === 'light') {
      theme = storedTheme;
    }
  });

  const toggleTheme = (): void => {
    theme = theme === 'dark' ? 'light' : 'dark';
    window.localStorage.setItem(DOCS_THEME_STORAGE_KEY, theme);
  };
</script>

<svelte:head>
  <title>TrenchClaw Docs</title>
  <meta name="description" content="Straightforward TrenchClaw docs for install, setup, wallets, routines, and runtime behavior." />
</svelte:head>

<div class="docs-shell min-h-screen" data-docs-theme={theme}>
  <header class="docs-header">
    <div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <a href="/" class="docs-logo">TrenchClaw Docs</a>
      <nav class="flex items-center gap-3 text-sm">
        <button type="button" class="docs-theme-toggle" onclick={toggleTheme}>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <a class="docs-header-link" href="/docs">Docs Home</a>
        <a class="docs-header-link" href="/">Main Site</a>
      </nav>
    </div>
  </header>

  <main class="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
    <aside class="hidden lg:block">
      <div class="docs-sidebar">
        <p class="docs-sidebar-label">Docs</p>
        <nav class="mt-2">
          {#each data.docs as doc (doc.slug)}
            <a class="docs-nav-link" href={`/docs/${doc.slug}`}>{doc.title}</a>
          {/each}
        </nav>
      </div>
    </aside>

    <section>
      <div class="docs-index-hero">
        <p class="docs-kicker">Documentation</p>
        <h1 class="docs-index-title">Product docs</h1>
        <p class="docs-index-description">
          Clear docs for install, setup, wallets, swaps, routines, and runtime behavior.
        </p>
        <div class="docs-hero-actions">
          <a href="/docs/getting-started" class="docs-primary-button">Start here</a>
          <a href="/docs/runtime-and-frontends" class="docs-secondary-button">Runtime guide</a>
        </div>
      </div>

      <div class="docs-grid mt-8">
        {#each data.docs as doc (doc.slug)}
          <a href={`/docs/${doc.slug}`} class="docs-card">
            <p class="docs-card-label">Guide</p>
            <h2 class="docs-card-title">{doc.title}</h2>
            <p class="docs-card-description">{doc.description}</p>
            <p class="docs-card-link">Open guide</p>
          </a>
        {/each}
      </div>

      {#if data.docs.length === 0}
        <p class="mt-6 text-sm text-[#525866]">No documentation is available yet.</p>
      {/if}
    </section>
  </main>
</div>
