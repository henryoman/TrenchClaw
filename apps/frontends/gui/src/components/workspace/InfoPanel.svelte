<script lang="ts">
  import RetroPanel from "../ui/RetroPanel.svelte";

  const docsLinks = [
    {
      label: "Get started",
      href: "/docs/getting-started",
      description: "Boot the runtime, connect keys, and get the first safe path working.",
    },
    {
      label: "AI + vault setup",
      href: "/docs/ai-and-vault-setup",
      description: "Set up OpenRouter or Gateway keys and the minimum runtime config.",
    },
    {
      label: "Current limitations",
      href: "/docs/troubleshooting-and-current-limitations",
      description: "Read the rough edges before trusting this build with anything important.",
    },
    {
      label: "Instances + safety",
      href: "/docs/instances-and-safety-profiles",
      description: "Understand how instance state and safety profiles gate behavior.",
    },
  ] as const;
</script>

<RetroPanel title="Info">
  <div class="info-root">
    <section class="warning-block">
      <p class="eyebrow tc-kicker">Experimental Release</p>
      <h2 class="headline">This release is unsafe, limited in scope, and experimental.</h2>
      <p class="body tc-copy-sm">Use small balances and expect rough edges.</p>
    </section>

    <section class="section">
      <h3 class="section-title tc-kicker">Why it is limited</h3>
      <ul class="facts tc-copy-sm">
        <li>We are narrowing scope on purpose.</li>
        <li>The priority is getting keys, wallets, swaps, transfers, queueing, and runtime state stable first.</li>
        <li>Less surface area makes failures easier to isolate and fix.</li>
      </ul>
    </section>

    <section class="section">
      <h3 class="section-title tc-kicker">What to assume</h3>
      <ul class="facts tc-copy-sm">
        <li>This is not a polished production trading terminal.</li>
        <li>Some flows still need manual verification.</li>
        <li>Prefer explicit confirmations and isolated testing.</li>
      </ul>
    </section>

    <section class="section">
      <div class="links-head">
        <h3 class="section-title tc-kicker">Docs</h3>
        <a class="docs-home tc-kicker" href="/docs" target="_blank" rel="noreferrer">All docs</a>
      </div>
      <div class="links-grid">
        {#each docsLinks as link}
          <a class="link-card tc-link-card" href={link.href} target="_blank" rel="noreferrer">
            <span class="link-label tc-kicker">{link.label}</span>
            <span class="link-copy tc-copy-sm">{link.description}</span>
          </a>
        {/each}
      </div>
    </section>
  </div>
</RetroPanel>

<style>
  .info-root {
    display: grid;
    gap: var(--tc-space-3);
  }

  .warning-block {
    display: grid;
    gap: 6px;
    padding: var(--tc-space-3);
    border: 1px solid var(--tc-color-red);
    background: color-mix(in srgb, var(--tc-color-red) 6%, var(--tc-color-black-2));
  }

  .eyebrow {
    margin: 0;
    color: var(--tc-color-red);
    letter-spacing: var(--tc-track-wide);
  }

  .headline {
    margin: 0;
    color: var(--tc-color-cream);
    font-size: var(--tc-type-md);
    line-height: 1.3;
    font-weight: 500;
  }

  .section {
    display: grid;
    gap: var(--tc-space-2);
  }

  .section-title {
    margin: 0;
    color: var(--tc-color-gray-3);
  }

  .body {
    margin: 0;
    color: var(--tc-color-gray-3);
  }

  .facts {
    margin: 0;
    padding-left: 18px;
    color: var(--tc-color-gray-3);
    display: grid;
    gap: 6px;
  }

  .links-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--tc-space-2);
  }

  .docs-home {
    color: var(--tc-color-gray-3);
    text-decoration: none;
  }

  .docs-home:hover {
    color: var(--tc-color-cream);
  }

  .links-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--tc-space-2);
  }

  .link-label {
    color: var(--tc-color-cream);
  }

  .link-copy {
    color: var(--tc-color-gray-3);
  }

  @media (max-width: 760px) {
    .links-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
