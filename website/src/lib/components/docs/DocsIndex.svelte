<script lang="ts">
  import { resolve } from '$app/paths';
  import { splitDocsBySection, type DocListItem } from '$lib/docs';

  let { docs }: { docs: DocListItem[] } = $props();

  const sections = $derived(splitDocsBySection(docs));
  const startHere = $derived(sections.primary.find((doc) => doc.slug === 'getting-started') ?? sections.primary[0]);
  const keysGuide = $derived(sections.primary.find((doc) => doc.slug === 'keys-and-settings') ?? sections.primary[1]);
  const capabilityGuide = $derived(sections.primary.find((doc) => doc.slug === 'beta-capabilities') ?? sections.primary[2]);
</script>

<div class="docs-index-hero">
  <p class="docs-kicker">Beta docs</p>
  <h1 class="docs-index-title">Clear setup. Real capabilities. No filler.</h1>
  <p class="docs-index-description">
    Start with the release, use the recommended defaults, and add only the keys and tools that the tested beta
    workflows actually need.
  </p>
  <div class="docs-hero-actions">
    {#if startHere}
      <a href={resolve('/docs/[slug]', { slug: startHere.slug })} class="docs-primary-button">Start here</a>
    {/if}
    {#if keysGuide}
      <a href={resolve('/docs/[slug]', { slug: keysGuide.slug })} class="docs-secondary-button">Keys and settings</a>
    {/if}
  </div>
</div>

<section class="docs-index-section mt-8" aria-labelledby="docs-guides-title">
  <p class="docs-kicker">Beta guides</p>
  <h2 id="docs-guides-title" class="docs-index-section-title">The three pages that matter for this release.</h2>
  <p class="docs-index-section-intro">
    Read these in order if you are setting up TrenchClaw for the first time.
  </p>
  <div class="docs-grid mt-6">
    {#each sections.primary as doc (doc.slug)}
      <a href={resolve('/docs/[slug]', { slug: doc.slug })} class="docs-card">
        <p class="docs-card-label">Beta guide</p>
        <h2 class="docs-card-title">{doc.title}</h2>
        <p class="docs-card-description">{doc.description}</p>
        <p class="docs-card-link">Open guide</p>
      </a>
    {/each}
  </div>
</section>

{#if capabilityGuide}
  <section class="docs-index-section mt-8" aria-labelledby="docs-quick-path-title">
    <p class="docs-kicker">Quick path</p>
    <h2 id="docs-quick-path-title" class="docs-index-section-title">If you want the shortest safe setup.</h2>
    <p class="docs-index-section-intro">
      Install the release, run `trenchclaw`, create or sign into an instance, add your OpenRouter key, test the AI
      connection, then use {capabilityGuide.title.toLowerCase()} to decide whether you actually need Helius or Jupiter
      Ultra.
    </p>
  </section>
{/if}

{#if sections.reference.length > 0}
  <section class="docs-index-section mt-8" aria-labelledby="docs-reference-title">
    <p class="docs-kicker">Reference</p>
    <h2 id="docs-reference-title" class="docs-index-section-title">Technical background when you need more depth.</h2>
    <div class="docs-grid mt-6">
      {#each sections.reference as doc (doc.slug)}
        <a href={resolve('/docs/[slug]', { slug: doc.slug })} class="docs-card">
          <p class="docs-card-label">Reference</p>
          <h2 class="docs-card-title">{doc.title}</h2>
          <p class="docs-card-description">{doc.description}</p>
          <p class="docs-card-link">Open reference</p>
        </a>
      {/each}
    </div>
  </section>
{/if}

{#if docs.length === 0}
  <p class="docs-empty-state mt-6">No documentation is available yet.</p>
{/if}
