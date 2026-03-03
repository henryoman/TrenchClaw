<script lang="ts">
  import { resolve } from '$app/paths';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.doc.title} | TrenchClaw Docs</title>
  <meta name="description" content={data.doc.description} />
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
  <main class="mx-auto max-w-4xl px-6 py-20">
    <a href={resolve('/docs')} class="text-sm text-cyan-brand hover:underline">&larr; All docs</a>
    <article class="docs-content mt-6 border border-border-subtle p-8 md:p-12">
      <h1>{data.doc.title}</h1>
      {@html data.doc.html}
    </article>
  </main>
</div>
