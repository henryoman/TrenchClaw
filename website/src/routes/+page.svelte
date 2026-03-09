<script lang="ts">
  const githubUrl = 'https://github.com/henryoman/trenchclaw';

  const installTargets = [
    {
      label: 'macOS',
      command: "curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/macos-bootstrap.sh | bash"
    },
    {
      label: 'Linux',
      command: "curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | bash"
    }
  ];

  const quickLinks = [
    { label: 'Getting Started', href: '/docs/getting-started', description: 'Install, configure, and launch the runtime.' },
    { label: 'AI + Vault Setup', href: '/docs/ai-and-vault-setup', description: 'Hook up keys, providers, and secure local state.' },
    { label: 'Runtime + Frontends', href: '/docs/runtime-and-frontends', description: 'Understand the CLI, web UI, and operator flow.' }
  ];

  const principles = [
    {
      title: 'Docs-first operator UX',
      description: 'The site now reads like a technical product, not a neon landing page. Key flows are surfaced immediately.'
    },
    {
      title: 'Filesystem-native wallet flow',
      description: 'Wallet groups, keypair dumps, and sidecar metadata stay aligned with the runtime contract.'
    },
    {
      title: 'Strict runtime contracts',
      description: 'Schema-driven actions, policy checks, and small composable routines keep execution legible.'
    }
  ];

  const terminalLines = [
    { tone: 'dim', text: '$ trenchclaw start --profile dangerous' },
    { tone: 'dim', text: 'booting runtime...' },
    { tone: 'bright', text: 'openrouter model resolved' },
    { tone: 'bright', text: 'wallet library loaded from protected instance path' },
    { tone: 'bright', text: 'scheduler online' },
    { tone: 'dim', text: 'web gui: http://127.0.0.1:4020' },
    { tone: 'dim', text: 'docs: /docs/getting-started' },
    { tone: 'bright', text: 'ready for actions and routines' }
  ];

  const stack = [
    { label: 'Runtime', value: 'Bun + TypeScript + SvelteKit website' },
    { label: 'Solana', value: '@solana/kit with provider-agnostic RPC adapters' },
    { label: 'Agent', value: 'AI SDK orchestration with runtime policies' },
    { label: 'State', value: 'SQLite, JSONL indexes, and protected filesystem storage' }
  ];

  const comparison = [
    { feature: 'Website mood', current: 'clean grayscale docs surface', prior: 'turquoise / purple marketing theme' },
    { feature: 'Primary call to action', current: 'read docs and install fast', prior: 'generic landing page buttons' },
    { feature: 'Code presentation', current: 'terminal-first surfaces and copyable snippets', prior: 'mixed accent blocks' }
  ];
</script>

<div class="min-h-screen bg-background text-foreground">
  <nav class="fixed inset-x-0 top-0 z-50 border-b border-border-subtle bg-background/85 backdrop-blur-xl">
    <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
      <a href="/" class="flex items-center gap-3">
        <img src="/logo.png" alt="TrenchClaw" class="logo-white h-8 w-8 object-contain" width="32" height="32" />
        <span class="text-sm font-semibold tracking-[-0.02em] text-foreground">TrenchClaw</span>
      </a>

      <div class="flex items-center gap-6 text-sm">
        <a href="/docs" class="text-muted transition-colors hover:text-foreground">Docs</a>
        <a href={`${githubUrl}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noopener noreferrer" class="text-muted transition-colors hover:text-foreground">
          Architecture
        </a>
        <a href={githubUrl} target="_blank" rel="noopener noreferrer" class="rounded-full border border-border-strong px-4 py-2 text-foreground transition-colors hover:bg-white hover:text-black">
          GitHub
        </a>
      </div>
    </div>
  </nav>

  <section class="relative overflow-hidden px-6 pb-20 pt-32">
    <div class="hero-grid pointer-events-none absolute inset-0 opacity-60"></div>
    <div class="relative mx-auto grid max-w-7xl items-start gap-12 lg:grid-cols-[1.1fr_minmax(0,0.9fr)]">
      <div class="max-w-3xl">
        <p class="font-mono text-xs uppercase tracking-[0.22em] text-muted">Operator runtime for Solana</p>
        <h1 class="mt-4 max-w-4xl text-6xl font-extrabold leading-[0.94] tracking-[-0.06em] text-balance md:text-8xl">
          Dark, clean docs and a runtime that still feels like a terminal.
        </h1>
        <p class="mt-6 max-w-2xl text-lg leading-8 text-foreground-soft">
          TrenchClaw is a Bun-based Solana operator runtime with typed actions, filesystem-backed wallets, agent orchestration,
          and a docs surface that should feel closer to serious tooling than crypto landing-page noise.
        </p>

        <div class="mt-8 flex flex-col gap-4 sm:flex-row">
          <a href="/docs" class="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5">
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
            <div class="mt-1 text-sm text-muted">The web layer mirrors operator workflows</div>
          </div>
        </div>
      </div>

      <div class="relative">
        <div class="terminal-window relative">
          <div class="terminal-topbar flex items-center gap-2 px-4 py-3">
            <span class="terminal-dot"></span>
            <span class="terminal-dot"></span>
            <span class="terminal-dot"></span>
            <span class="terminal-label ml-3">operator shell</span>
          </div>
          <div class="terminal-body space-y-2 px-5 py-5">
            {#each terminalLines as line}
              <p class={line.tone === 'bright' ? 'terminal-line-bright' : 'terminal-line-dim'}>{line.text}</p>
            {/each}
          </div>
        </div>

        <div class="surface-card mt-5 grid gap-3 p-5">
          <div class="flex items-center justify-between">
            <span class="font-mono text-xs uppercase tracking-[0.18em] text-muted">Install</span>
            <span class="text-xs text-muted">Bootstrap script</span>
          </div>
          {#each installTargets as target (target.label)}
            <div class="rounded-2xl border border-border-subtle bg-white/[0.02] p-4">
              <div class="mb-2 flex items-center justify-between gap-3">
                <h2 class="text-sm font-semibold">{target.label}</h2>
                <span class="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">copy + run</span>
              </div>
              <code class="block overflow-x-auto font-mono text-xs leading-6 text-foreground-soft">{target.command}</code>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <section class="border-t border-border-subtle px-6 py-20">
    <div class="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_minmax(0,1.1fr)]">
      <div>
        <p class="font-mono text-xs uppercase tracking-[0.22em] text-muted">Quick links</p>
        <h2 class="mt-3 text-4xl font-extrabold tracking-[-0.05em] md:text-5xl">Start where the docs are actually useful.</h2>
        <p class="mt-4 max-w-xl text-base leading-8 text-foreground-soft">
          The docs area is the main product surface now. The homepage points into the real workflows instead of wasting space on loud accent colors.
        </p>
      </div>

      <div class="grid gap-4">
        {#each quickLinks as item (item.href)}
          <a href={item.href} class="surface-card block p-6 transition-transform hover:-translate-y-0.5">
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
          <h2 class="mt-3 text-4xl font-extrabold tracking-[-0.05em] md:text-5xl">Less goofy. More operator-grade.</h2>
        </div>
        <p class="max-w-xl text-sm leading-7 text-foreground-soft">
          Every surface now leans grayscale, restrained, and technical. The terminal language stays because that is the product.
        </p>
      </div>

      <div class="grid gap-5 md:grid-cols-3">
        {#each principles as principle}
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
        <p class="font-mono text-xs uppercase tracking-[0.18em] text-muted">Runtime shape</p>
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
        <p class="font-mono text-xs uppercase tracking-[0.18em] text-muted">Site reset</p>
        <div class="mt-5 overflow-hidden rounded-2xl border border-border-subtle">
          <table class="w-full text-left text-sm">
            <thead class="bg-white/[0.03]">
              <tr>
                <th class="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Area</th>
                <th class="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Now</th>
                <th class="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Before</th>
              </tr>
            </thead>
            <tbody>
              {#each comparison as row, index}
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
          <p class="font-mono text-xs uppercase tracking-[0.22em] text-muted">Operator dashboard</p>
          <h2 class="mt-3 text-4xl font-extrabold tracking-[-0.05em] md:text-5xl">The site and the product should match.</h2>
        </div>
      </div>

      <div class="terminal-window relative">
        <div class="terminal-topbar flex items-center gap-2 px-4 py-3">
          <span class="terminal-dot"></span>
          <span class="terminal-dot"></span>
          <span class="terminal-dot"></span>
          <span class="terminal-label ml-3">gui preview</span>
        </div>
        <img src="/ui.png" alt="TrenchClaw operator dashboard UI" class="w-full object-cover" width="1024" height="780" />
      </div>
    </div>
  </section>

  <footer class="border-t border-border-subtle px-6 py-10">
    <div class="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
      <div>
        <p class="text-sm font-semibold tracking-[-0.02em]">TrenchClaw</p>
        <p class="mt-1 text-sm text-muted">Bun runtime, Solana operator tooling, and cleaner docs.</p>
      </div>
      <div class="flex gap-6 text-sm text-muted">
        <a href="/docs" class="transition-colors hover:text-foreground">Docs</a>
        <a href={githubUrl} target="_blank" rel="noopener noreferrer" class="transition-colors hover:text-foreground">GitHub</a>
        <a href={`${githubUrl}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noopener noreferrer" class="transition-colors hover:text-foreground">
          Architecture
        </a>
      </div>
    </div>
  </footer>
</div>
