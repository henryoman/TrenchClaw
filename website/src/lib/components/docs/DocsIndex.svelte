<script lang="ts">
  import { resolve } from '$app/paths';
  import { splitDocsBySection, type DocListItem } from '$lib/docs';

  let { docs }: { docs: DocListItem[] } = $props();

  const sections = $derived(splitDocsBySection(docs));
  const startHere = $derived(sections.primary.find((doc) => doc.slug === 'getting-started') ?? sections.primary[0]);
  const keysGuide = $derived(sections.primary.find((doc) => doc.slug === 'keys-and-settings') ?? sections.primary[1]);
</script>

<div class="docs-index-hero">
  <p class="docs-kicker">Setup docs</p>
  <h1 class="docs-index-title">Set up TrenchClaw without guessing.</h1>
  <p class="docs-index-description">
    Everything here is about first run setup: install the app, add the right keys, and understand the one swap setting
    that matters today.
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
  <p class="docs-kicker">Setup path</p>
  <h2 id="docs-guides-title" class="docs-index-section-title">The two pages that matter.</h2>
  <p class="docs-index-section-intro">
    Read these in order if you are setting up TrenchClaw for the first time.
  </p>
  <div class="docs-grid mt-6">
    {#each sections.primary as doc (doc.slug)}
      <a href={resolve('/docs/[slug]', { slug: doc.slug })} class="docs-card">
        <p class="docs-card-label">Guide</p>
        <h2 class="docs-card-title">{doc.title}</h2>
        <p class="docs-card-description">{doc.description}</p>
        <p class="docs-card-link">Open guide</p>
      </a>
    {/each}
  </div>
</section>

<section class="docs-index-section mt-8" aria-labelledby="docs-quick-path-title">
  <p class="docs-kicker">Short version</p>
  <h2 id="docs-quick-path-title" class="docs-index-section-title">Use OpenRouter first. Add RPC or Ultra only when you need them.</h2>
  <p class="docs-index-section-intro">
    The default path is simple: install the release, run trenchclaw, create or sign into an instance, save your
    OpenRouter API Key, set OpenRouter plus GPT-5.4 Nano, test the AI connection, then stop there unless you
    specifically want a private RPC or Ultra swaps.
  </p>
</section>

{#if docs.length === 0}
  <p class="docs-empty-state mt-6">No documentation is available yet.</p>
{/if}
