<script lang="ts">
  import { resolve } from '$app/paths';
  import type { DocListItem } from '$lib/docs';

  let { docs }: { docs: DocListItem[] } = $props();

  const startHere = $derived(docs[0]);
  const runtimeGuide = $derived(docs.find((doc) => doc.slug === 'runtime-and-frontends') ?? docs[1] ?? docs[0]);
</script>

<div class="docs-index-hero">
  <p class="docs-kicker">Documentation</p>
  <h1 class="docs-index-title">Product docs</h1>
  <p class="docs-index-description">
    Clear docs for install, setup, wallets, swaps, routines, and runtime behavior.
  </p>
  <div class="docs-hero-actions">
    {#if startHere}
      <a href={resolve('/docs/[slug]', { slug: startHere.slug })} class="docs-primary-button">Start here</a>
    {/if}
    {#if runtimeGuide}
      <a href={resolve('/docs/[slug]', { slug: runtimeGuide.slug })} class="docs-secondary-button">Runtime guide</a>
    {/if}
  </div>
</div>

<div class="docs-grid mt-8">
  {#each docs as doc (doc.slug)}
    <a href={resolve('/docs/[slug]', { slug: doc.slug })} class="docs-card">
      <p class="docs-card-label">{doc.featured ? 'Featured guide' : 'Guide'}</p>
      <h2 class="docs-card-title">{doc.title}</h2>
      <p class="docs-card-description">{doc.description}</p>
      <p class="docs-card-link">Open guide</p>
    </a>
  {/each}
</div>

{#if docs.length === 0}
  <p class="docs-empty-state mt-6">No documentation is available yet.</p>
{/if}
