<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.doc.title} | TrenchClaw Docs</title>
  <meta name="description" content={data.doc.description} />
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
        <p class="docs-sidebar-label">Guides</p>
        <nav class="mt-2">
          {#each data.docs as doc (doc.slug)}
            <a
              class={`docs-nav-link ${doc.slug === data.doc.slug ? 'docs-nav-link-active' : ''}`}
              href={`/docs/${doc.slug}`}
              aria-current={doc.slug === data.doc.slug ? 'page' : undefined}
            >
              {doc.title}
            </a>
          {/each}
        </nav>
      </div>
    </aside>

    <section class="min-w-0">
      <a href="/docs" class="docs-back-link">&larr; All docs</a>
      <article class="docs-content mt-4">
        <h1>{data.doc.title}</h1>
        {@html data.doc.html}
      </article>
    </section>
  </main>
</div>
