<script lang="ts">
  import { resolve } from '$app/paths';
  import { splitDocsBySection, type DocListItem } from '$lib/docs';

  let { docs }: { docs: DocListItem[] } = $props();

  const sections = $derived(splitDocsBySection(docs));
  const startHere = $derived(sections.primary.find((doc) => doc.slug === 'getting-started') ?? sections.primary[0]);
  const keysGuide = $derived(sections.primary.find((doc) => doc.slug === 'keys-and-settings') ?? sections.primary[1]);
  const architectureGuide = $derived(sections.reference.find((doc) => doc.slug === 'architecture') ?? sections.reference[0]);
  const currentCapabilities = [
    {
      title: 'Swap with Ultra',
      description: 'Use Jupiter Ultra for the supported swap path when you add an Ultra API key.',
    },
    {
      title: 'Research with AI',
      description: 'Run the recommended OpenRouter setup for chat and scoped Solana workflow help.',
    },
    {
      title: 'Use private RPC when needed',
      description: 'Add Helius or another private RPC only when you want higher quality reads or provider-specific flows.',
    },
    {
      title: 'Manage local instances and wallets',
      description: 'Keep your instance state, vaults, and wallet metadata local to the runtime.',
    },
  ] as const;
</script>

<div class="docs-index-hero">
  <p class="docs-kicker">Docs</p>
  <h1 class="docs-index-title">Set up TrenchClaw without guessing.</h1>
  <p class="docs-index-description">
    Start with install and keys, then use the architecture page when you want the real explanation of the runtime,
    instance state, and `.runtime` versus `.runtime-state`.
  </p>
  <div class="docs-hero-actions">
    {#if startHere}
      <a href={resolve('/docs/[slug]', { slug: startHere.slug })} class="docs-primary-button">Start here</a>
    {/if}
    {#if keysGuide}
      <a href={resolve('/docs/[slug]', { slug: keysGuide.slug })} class="docs-secondary-button">Keys and settings</a>
    {/if}
    {#if architectureGuide}
      <a href={resolve('/docs/[slug]', { slug: architectureGuide.slug })} class="docs-secondary-button">Architecture</a>
    {/if}
  </div>
</div>

<section class="docs-index-section mt-8" aria-labelledby="docs-guides-title">
  <p class="docs-kicker">Setup path</p>
  <h2 id="docs-guides-title" class="docs-index-section-title">Start with setup.</h2>
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

{#if sections.reference.length > 0}
  <section class="docs-index-section mt-8" aria-labelledby="docs-reference-title">
    <p class="docs-kicker">Power users</p>
    <h2 id="docs-reference-title" class="docs-index-section-title">Understand how the runtime is actually put together.</h2>
    <p class="docs-index-section-intro">
      Use the reference page when you want the runtime shape, boot flow, instance layout, and the guard rails that
      separate TrenchClaw from thinner wrappers.
    </p>
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

<section class="docs-index-section mt-8" aria-labelledby="docs-quick-path-title">
  <p class="docs-kicker">Short version</p>
  <h2 id="docs-quick-path-title" class="docs-index-section-title">Use OpenRouter first. Add RPC or Ultra only when you need them.</h2>
  <p class="docs-index-section-intro">
    The default path is simple: install the release, run trenchclaw, create or sign into an instance, save your
    OpenRouter API Key, set OpenRouter plus GPT-5.4 Nano, test the AI connection, then stop there unless you
    specifically want a private RPC or Ultra swaps.
  </p>
</section>

<section class="docs-index-section mt-8" aria-labelledby="docs-capabilities-title">
  <p class="docs-kicker">Right now</p>
  <h2 id="docs-capabilities-title" class="docs-index-section-title">What you can do with TrenchClaw today.</h2>
  <p class="docs-index-section-intro">
    The scope is intentionally narrow right now. These are the main things the current docs and setup are built around.
  </p>
  <div class="docs-capability-grid mt-5">
    {#each currentCapabilities as capability (capability.title)}
      <div class="docs-capability-card">
        <h3 class="docs-capability-title">{capability.title}</h3>
        <p class="docs-capability-description">{capability.description}</p>
      </div>
    {/each}
  </div>
</section>

{#if docs.length === 0}
  <p class="docs-empty-state mt-6">No documentation is available yet.</p>
{/if}
