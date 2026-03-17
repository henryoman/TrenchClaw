<script lang="ts">
  import { resolve } from '$app/paths';

  import {
    comparison,
    getHomepageQuickLinks,
    githubUrl,
    installTargets,
    xUrl,
    principles,
    stack,
    terminalLines,
  } from '$lib/site/content';

  const quickLinks = getHomepageQuickLinks();
</script>

<div class="min-h-screen bg-background text-foreground">
  <nav class="fixed inset-x-0 top-0 z-50 border-b border-border-subtle bg-background/85 backdrop-blur-xl">
    <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
      <a href={resolve('/', {})} class="flex items-center gap-3">
        <img src="/logo.png" alt="TrenchClaw" class="logo-white h-8 w-8 object-contain" width="32" height="32" />
        <img src="/trenchclaw.png" alt="" class="hidden" width="32" height="32" aria-hidden="true" />
        <span class="text-sm font-semibold tracking-[-0.02em] text-foreground">TrenchClaw</span>
      </a>

      <div class="flex items-center gap-6 text-sm">
        <a href={resolve('/docs', {})} class="text-muted transition-colors hover:text-foreground">Docs</a>
        <a href={resolve('/docs/[slug]', { slug: 'architecture' })} class="text-muted transition-colors hover:text-foreground">
          Architecture
        </a>
        <div class="flex items-center gap-3">
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="TrenchClaw on GitHub"
            class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-strong text-foreground transition-colors hover:bg-white hover:text-black"
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5 fill-current" aria-hidden="true">
              <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.12.82-.25.82-.57v-2.2c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.1-.75.08-.74.08-.74 1.21.08 1.86 1.25 1.86 1.25 1.08 1.84 2.83 1.31 3.51 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.48-1.33-5.48-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.4 11.4 0 0 1 6.01 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.82 5.63-5.5 5.93.43.38.82 1.12.82 2.26v3.35c0 .32.22.7.83.57A12 12 0 0 0 12 .5Z"/>
            </svg>
          </a>
          <a
            href={xUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow TrenchClaw on X"
            class="inline-flex items-center gap-2 rounded-full border border-border-strong px-4 py-2 text-foreground transition-colors hover:bg-white hover:text-black"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4 fill-current" aria-hidden="true">
              <path d="M18.9 2H22l-6.77 7.74L23 22h-6.1l-4.78-6.77L6.2 22H3.1l7.24-8.28L1 2h6.26l4.31 6.14L18.9 2Zm-1.07 18h1.69L6.35 3.9H4.54L17.83 20Z"/>
            </svg>
            <span class="text-sm font-medium">Follow us on X</span>
          </a>
        </div>
      </div>
    </div>
  </nav>

  <section class="relative overflow-hidden px-6 pb-20 pt-32">
    <div class="hero-grid pointer-events-none absolute inset-0 opacity-60"></div>
    <div class="relative mx-auto grid max-w-7xl items-start gap-12 lg:grid-cols-[1.1fr_minmax(0,0.9fr)]">
      <div class="max-w-3xl">
        <p class="font-mono text-xs uppercase tracking-[0.22em] text-muted">Local Solana runtime</p>
        <h1 class="mt-4 max-w-4xl text-6xl font-extrabold leading-[0.94] tracking-[-0.06em] text-balance md:text-8xl">
          The Solana-native AI assistant.
        </h1>
        <p class="mt-6 max-w-2xl text-lg leading-8 text-foreground-soft">
          TrenchClaw is a local Solana runtime with actions, wallets, routines, and a local GUI.
        </p>
        <p class="mt-4 max-w-2xl text-sm leading-7 text-foreground-soft">
          Install from the release docs, then add Solana CLI, Helius CLI, and provider keys only for the workflows you
          actually use.
        </p>

        <div class="mt-8 flex flex-col gap-4 sm:flex-row">
          <a href={resolve('/docs', {})} class="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5">
            Open docs
          </a>
          <a href={githubUrl} target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center rounded-full border border-border-strong px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-white hover:text-black">
            View repository
          </a>
        </div>

        <div class="mt-10 grid gap-4 md:grid-cols-3">
          <div class="surface-card p-5">
            <div class="text-2xl font-bold tracking-[-0.04em]">~100KB</div>
            <div class="mt-1 text-sm text-muted">Modern `@solana/kit` footprint</div>
          </div>
          <div class="surface-card p-5">
            <div class="text-2xl font-bold tracking-[-0.04em]">JSONL + sidecars</div>
            <div class="mt-1 text-sm text-muted">Wallet metadata stays inspectable</div>
          </div>
          <div class="surface-card p-5">
            <div class="text-2xl font-bold tracking-[-0.04em]">CLI first</div>
            <div class="mt-1 text-sm text-muted">Some workflows are still chat- and runtime-driven</div>
          </div>
        </div>
      </div>

      <div class="relative">
        <div class="terminal-window relative">
          <div class="terminal-topbar flex items-center gap-2 px-4 py-3">
            <span class="terminal-dot"></span>
            <span class="terminal-dot"></span>
            <span class="terminal-dot"></span>
            <span class="terminal-label ml-3">runtime shell</span>
          </div>
          <div class="terminal-body space-y-2 px-5 py-5">
            {#each terminalLines as line (line.text)}
              <p class={line.tone === 'bright' ? 'terminal-line-bright' : 'terminal-line-dim'}>{line.text}</p>
            {/each}
          </div>
        </div>

        <div class="surface-card mt-5 grid gap-3 p-5">
          <div class="flex items-center justify-between">
            <span class="font-mono text-xs uppercase tracking-[0.18em] text-muted">Install</span>
            <span class="text-xs text-muted">Release installer</span>
          </div>
          {#each installTargets as target (target.label)}
            <div class="rounded-2xl border border-border-subtle bg-white/2 p-4">
              <div class="mb-2 flex items-center justify-between gap-3">
                <h2 class="text-sm font-semibold">{target.label}</h2>
                <span class="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">copy + run</span>
              </div>
              <code class="block overflow-x-auto whitespace-pre-wrap break-all font-mono text-[13px] leading-6 text-foreground">
                {target.command}
              </code>
            </div>
          {/each}
          <p class="text-xs leading-6 text-muted">
            Fetches the installer, which resolves a GitHub Release tarball and verifies its checksum before install.
          </p>
        </div>
      </div>
    </div>
  </section>

  <section class="border-t border-border-subtle px-6 py-20">
    <div class="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_minmax(0,1.1fr)]">
      <div>
        <p class="font-mono text-xs uppercase tracking-[0.22em] text-muted">Quick links</p>
        <h2 class="mt-3 text-4xl font-extrabold tracking-[-0.05em] md:text-5xl">Start with the core workflows.</h2>
        <p class="mt-4 max-w-xl text-base leading-8 text-foreground-soft">
          Install the runtime, connect providers and vaults, then launch the CLI and GUI with the documented first-run flow.
        </p>
      </div>

      <div class="grid gap-4">
        {#each quickLinks as item (item.slug)}
          <a href={resolve('/docs/[slug]', { slug: item.slug })} class="surface-card block p-6 transition-transform hover:-translate-y-0.5">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Guide</p>
                <h3 class="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">{item.label}</h3>
                <p class="mt-2 max-w-xl text-sm leading-7 text-foreground-soft">{item.description}</p>
              </div>
              <svg class="h-4 w-4 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M5 12h14M12 5l7 7-7 7"></path>
              </svg>
            </div>
          </a>
        {/each}
      </div>
    </div>
  </section>

  <section class="border-t border-border-subtle px-6 py-20">
    <div class="mx-auto max-w-7xl">
      <div class="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="font-mono text-xs uppercase tracking-[0.22em] text-muted">Principles</p>
          <h2 class="mt-3 text-4xl font-extrabold tracking-[-0.05em] md:text-5xl">Built for direct control.</h2>
        </div>
        <p class="max-w-xl text-sm leading-7 text-foreground-soft">
          Validated actions, policy checks, and local state make behavior easier to inspect when the agent is allowed to act.
        </p>
      </div>

      <div class="grid gap-5 md:grid-cols-3">
        {#each principles as principle (principle.title)}
          <div class="surface-card p-6">
            <div class="font-mono text-xs uppercase tracking-[0.16em] text-muted">0{principles.indexOf(principle) + 1}</div>
            <h3 class="mt-4 text-xl font-semibold tracking-[-0.03em]">{principle.title}</h3>
            <p class="mt-3 text-sm leading-7 text-foreground-soft">{principle.description}</p>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="border-t border-border-subtle px-6 py-20">
    <div class="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.95fr_minmax(0,1.05fr)]">
      <div class="surface-card p-6">
        <p class="font-mono text-xs uppercase tracking-[0.18em] text-muted">Stack</p>
        <div class="mt-5 grid gap-px overflow-hidden rounded-2xl border border-border-subtle bg-border-subtle">
          {#each stack as item (item.label)}
            <div class="grid gap-2 bg-background-panel p-4 md:grid-cols-[180px_minmax(0,1fr)] md:items-start">
              <div class="font-mono text-xs uppercase tracking-[0.16em] text-muted">{item.label}</div>
              <div class="text-sm leading-7 text-foreground-soft">{item.value}</div>
            </div>
          {/each}
        </div>
      </div>

      <div class="surface-card p-6">
        <p class="font-mono text-xs uppercase tracking-[0.18em] text-muted">Runtime capabilities</p>
        <div class="mt-5 overflow-hidden rounded-2xl border border-border-subtle">
          <table class="w-full text-left text-sm">
            <thead class="bg-white/3">
              <tr>
                <th class="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Area</th>
                <th class="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">What it covers</th>
                <th class="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Why it matters</th>
              </tr>
            </thead>
            <tbody>
              {#each comparison as row, index (row.feature)}
                <tr class={index < comparison.length - 1 ? 'border-t border-border-subtle' : ''}>
                  <td class="px-4 py-4 text-foreground">{row.feature}</td>
                  <td class="px-4 py-4 text-foreground-soft">{row.current}</td>
                  <td class="px-4 py-4 text-muted">{row.prior}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>

  <section class="border-t border-border-subtle px-6 py-20">
    <div class="mx-auto max-w-7xl">
      <div class="mb-8 flex items-end justify-between gap-6">
        <div>
          <p class="font-mono text-xs uppercase tracking-[0.22em] text-muted">Runtime dashboard</p>
          <h2 class="mt-3 text-4xl font-extrabold tracking-[-0.05em] md:text-5xl">Runtime dashboard</h2>
        </div>
      </div>

      <div class="terminal-window relative">
        <div class="terminal-topbar flex items-center gap-2 px-4 py-3">
          <span class="terminal-dot"></span>
          <span class="terminal-dot"></span>
          <span class="terminal-dot"></span>
          <span class="terminal-label ml-3">dashboard</span>
        </div>
        <img src="/ui.png" alt="TrenchClaw runtime dashboard" class="w-full object-cover" width="1024" height="780" />
      </div>
    </div>
  </section>

  <footer class="border-t border-border-subtle px-6 py-10">
    <div class="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
      <div>
        <p class="text-sm font-semibold tracking-[-0.02em]">TrenchClaw</p>
        <p class="mt-1 text-sm text-muted">Bun runtime, Solana tooling, and local-first state.</p>
      </div>
      <div class="flex gap-6 text-sm text-muted">
        <a href={resolve('/docs', {})} class="transition-colors hover:text-foreground">Docs</a>
        <a href={githubUrl} target="_blank" rel="noopener noreferrer" class="transition-colors hover:text-foreground">GitHub</a>
        <a href={resolve('/docs/[slug]', { slug: 'architecture' })} class="transition-colors hover:text-foreground">
          Architecture
        </a>
      </div>
    </div>
  </footer>
</div>
