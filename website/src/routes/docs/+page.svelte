<script lang="ts">
  import { resolve } from '$app/paths';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>TrenchClaw Docs</title>
  <meta name="description" content="Documentation for TrenchClaw runtime, frontends, and deployment." />
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
  <main class="mx-auto max-w-4xl px-6 py-20">
    <a href={resolve('/')} class="text-sm text-cyan-brand hover:underline">&larr; Back to home</a>

    <header class="mt-6 border-b border-border-subtle pb-8">
      <h1 class="text-5xl font-black tracking-tight">Documentation</h1>
      <p class="mt-3 max-w-2xl text-sm leading-relaxed text-muted font-extralight">
        Reference docs for setup, runtime behavior, and deployment. Add more markdown files in
        <code>website/src/content/docs</code> and they appear here automatically.
      </p>
    </header>

    <section class="mt-10 space-y-4">
      {#if data.docs.length === 0}
        <p class="text-sm text-muted">No docs found yet.</p>
      {:else}
        {#each data.docs as doc (doc.slug)}
          <a
            href={resolve(`/docs/${doc.slug}`)}
            class="block border border-border-subtle p-5 transition-colors hover:border-cyan-brand"
          >
            <h2 class="text-xl font-semibold">{doc.title}</h2>
            <p class="mt-2 text-sm text-muted font-extralight leading-relaxed">{doc.description}</p>
          </a>
        {/each}
      {/if}
    </section>
  </main>
</div>
