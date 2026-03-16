<script lang="ts">
  import { resolve } from '$app/paths';
  import type { DocListItem } from '$lib/docs';
  import { docsPrerequisiteBootstrap, docsPrerequisites } from '$lib/site/content';

  let { docs }: { docs: DocListItem[] } = $props();

  const startHere = $derived(docs[0]);
  const runtimeGuide = $derived(docs.find((doc) => doc.slug === 'runtime-and-frontends') ?? docs[1] ?? docs[0]);
</script>

<div class="docs-index-hero">
  <p class="docs-kicker">Documentation</p>
  <h1 class="docs-index-title">Product docs</h1>
  <p class="docs-index-description">
    Clear docs for install, prerequisites, wallets, swaps, routines, and runtime behavior.
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

<section class="docs-prereq-section mt-8" aria-labelledby="docs-prereq-title">
  <div class="docs-prereq-shell">
    <div class="docs-prereq-heading">
      <p class="docs-kicker">Recommended prerequisites</p>
      <h2 id="docs-prereq-title" class="docs-prereq-title">Set up the minimum stuff first.</h2>
      <p class="docs-prereq-description">
        The scope here is simple: install TrenchClaw, run the updater script if you want managed tool refreshes,
        then make sure the separate tools and API keys below exist before deeper setup.
      </p>
    </div>

    <div class="docs-prereq-layout">
      <div class="docs-prereq-bootstrap">
        <div class="docs-prereq-chip">Recommended first step</div>
        <h3 class="docs-prereq-bootstrap-title">{docsPrerequisiteBootstrap.label}</h3>
        <p class="docs-prereq-bootstrap-description">{docsPrerequisiteBootstrap.description}</p>
        <code class="docs-prereq-command">{docsPrerequisiteBootstrap.command}</code>
        <p class="docs-prereq-note">{docsPrerequisiteBootstrap.note}</p>
        {#if startHere}
          <a href={resolve('/docs/[slug]', { slug: startHere.slug })} class="docs-secondary-button docs-prereq-link">
            Open getting started
          </a>
        {/if}
      </div>

      <div class="docs-prereq-grid">
        {#each docsPrerequisites as item (item.label)}
          <div class="docs-prereq-card">
            <p class="docs-prereq-card-kind">{item.kind}</p>
            <h3 class="docs-prereq-card-title">{item.label}</h3>
            <p class="docs-prereq-card-description">{item.description}</p>
            {#if item.command}
              <code class="docs-prereq-mini-command">{item.command}</code>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>

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
