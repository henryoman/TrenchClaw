<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>TrenchClaw Docs</title>
  <meta name="description" content="TrenchClaw documentation for installation, setup, and first-run workflows." />
</svelte:head>

<div class="docs-shell min-h-screen">
  <header class="docs-header">
    <div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <a href="/" class="docs-logo">TrenchClaw Docs</a>
      <nav class="flex items-center gap-4 text-sm">
        <a class="docs-header-link" href="/docs">Docs Home</a>
        <a class="docs-header-link" href="/">Main Site</a>
      </nav>
    </div>
  </header>

  <main class="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
    <aside class="hidden lg:block">
      <div class="docs-sidebar">
        <p class="docs-sidebar-label">Getting Started</p>
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
        <h1 class="docs-index-title">Technical docs that feel like part of the product.</h1>
        <p class="docs-index-description">
          Start with install and runtime setup, then move into wallet, vault, and frontend workflows. The layout is intentionally
          grayscale, terminal-heavy, and easy to scan under pressure.
        </p>

        <div class="terminal-window relative mt-8">
          <div class="terminal-topbar flex items-center gap-2 px-4 py-3">
            <span class="terminal-dot"></span>
            <span class="terminal-dot"></span>
            <span class="terminal-dot"></span>
            <span class="terminal-label ml-3">docs index</span>
          </div>
          <div class="terminal-body space-y-2 px-5 py-5">
            <p class="terminal-line-dim">$ open /docs/getting-started</p>
            <p class="terminal-line-bright">install checklist</p>
            <p class="terminal-line-bright">vault + AI provider wiring</p>
            <p class="terminal-line-bright">runtime + GUI launch flow</p>
            <p class="terminal-line-dim">copyable commands and cleaner code blocks</p>
          </div>
        </div>
      </div>

      <div class="mt-8 grid gap-4 sm:grid-cols-2">
        {#each data.docs as doc (doc.slug)}
          <a href={`/docs/${doc.slug}`} class="docs-card">
            <p class="docs-card-label">Guide</p>
            <h2 class="docs-card-title">{doc.title}</h2>
            <p class="docs-card-description">{doc.description}</p>
          </a>
        {/each}
      </div>

      {#if data.docs.length === 0}
        <p class="mt-6 text-sm text-[#525866]">No docs found yet.</p>
      {/if}
    </section>
  </main>
</div>
