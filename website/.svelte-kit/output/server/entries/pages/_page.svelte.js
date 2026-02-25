import { a0 as attr, a1 as ensure_array_like, a2 as attr_class, a3 as stringify, e as escape_html } from "../../chunks/index.js";
function _page($$renderer) {
  const githubUrl = "https://github.com/henryoman/trenchclaw";
  const features = [
    {
      label: "Lightning Fast",
      color: "cyan",
      description: "Bun runtime + @solana/kit (100KB vs 450KB web3.js). Modular imports, native Web Crypto, zero userspace polyfills."
    },
    {
      label: "Type-Safe Schemas",
      color: "purple",
      description: "Zod-first tool contracts. Compile-time transaction checks. Runtime validation of untrusted LLM-generated args before execution."
    },
    {
      label: "Functional & Composable",
      color: "cyan",
      description: "Immutable transaction pipelines. Modular actions, routines (DCA/swing/sniper), and triggers. Policy middleware built-in."
    }
  ];
  const checklist = [
    {
      color: "cyan",
      text: "Typed Solana actions with policy gates and retries"
    },
    {
      color: "purple",
      text: "Composable routines: DCA, swing, percentage, sniper"
    },
    {
      color: "cyan",
      text: "Event triggers: timers, price thresholds, on-chain events"
    },
    {
      color: "purple",
      text: "Bun SQLite state persistence with auto schema sync"
    },
    {
      color: "cyan",
      text: "Vercel AI SDK integration for agent orchestration"
    },
    {
      color: "purple",
      text: "Provider-agnostic RPC/Jupiter adapters (Helius, QuickNode)"
    }
  ];
  const stack = [
    {
      category: "Runtime",
      items: [
        {
          name: "Bun",
          description: "JavaScript runtime & package manager",
          url: "https://bun.sh"
        },
        {
          name: "TypeScript",
          description: "Strict type-safe codebase throughout",
          url: "https://typescriptlang.org"
        }
      ]
    },
    {
      category: "Solana",
      items: [
        {
          name: "@solana/kit",
          description: "Modern modular Solana SDK (~100KB)",
          url: "https://github.com/anza-xyz/solana-kit"
        },
        {
          name: "Jupiter",
          description: "Best-price DEX aggregation & routing",
          url: "https://jup.ag"
        },
        {
          name: "Helius / QuickNode",
          description: "Provider-agnostic RPC adapters",
          url: "https://helius.dev"
        }
      ]
    },
    {
      category: "AI & Orchestration",
      items: [
        {
          name: "Vercel AI SDK",
          description: "Agent tool-calling & LLM orchestration",
          url: "https://sdk.vercel.ai"
        },
        {
          name: "Zod",
          description: "Runtime schema validation for tool args",
          url: "https://zod.dev"
        }
      ]
    },
    {
      category: "Persistence",
      items: [
        {
          name: "Bun SQLite",
          description: "Native SQLite with auto schema sync",
          url: "https://bun.sh/docs/api/sqlite"
        }
      ]
    }
  ];
  const comparison = [
    {
      feature: "Primary SDK",
      tc: "@solana/kit",
      legacy: "@solana/web3.js v1"
    },
    { feature: "Bundle Size", tc: "~100KB", legacy: "~450KB" },
    {
      feature: "Architecture",
      tc: "Modular + Tree-shakeable",
      legacy: "Monolithic"
    },
    {
      feature: "Crypto API",
      tc: "Web Crypto (native)",
      legacy: "Polyfills"
    },
    {
      feature: "Type Safety",
      tc: "Compile-time TX checks",
      legacy: "Loose typing"
    },
    {
      feature: "Runtime Focus",
      tc: "Operator CLI + Agent",
      legacy: "Generic toolkit"
    }
  ];
  $$renderer.push(`<div class="min-h-screen bg-background text-foreground font-sans"><nav class="fixed top-0 w-full z-50 bg-background border-b border-border-subtle"><div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between"><div class="flex items-center gap-2"><div class="w-8 h-8 bg-cyan-brand"></div> <span class="text-xl font-bold tracking-tight">TrenchClaw</span></div> <div class="flex items-center gap-8"><a${attr("href", `${stringify(githubUrl)}#readme`)} target="_blank" rel="noopener noreferrer" class="text-sm text-muted hover:text-cyan-brand transition-colors font-light">Docs</a> <a${attr("href", githubUrl)} target="_blank" rel="noopener noreferrer" class="text-sm text-muted hover:text-cyan-brand transition-colors font-light">GitHub</a> <a${attr("href", githubUrl)} target="_blank" rel="noopener noreferrer" class="text-sm text-background bg-cyan-brand px-4 py-2 flex items-center gap-2 font-semibold hover:bg-purple-brand transition-colors"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"></path></svg> Star</a></div></div></nav> <section class="pt-32 pb-20 px-6"><div class="max-w-6xl mx-auto text-center"><div class="mb-12 flex justify-center"><img src="/logo.png" alt="TrenchClaw" class="w-72 md:w-[480px] object-contain" style="filter: invert(1) sepia(1) saturate(5) hue-rotate(240deg);" width="480" height="160"/></div> <h1 class="text-7xl md:text-8xl font-black mb-6 leading-tight tracking-tighter text-balance">The Next Generation<br/> <span class="text-cyan-brand">Solana Agent</span></h1> <p class="text-lg md:text-xl text-muted mb-8 max-w-3xl mx-auto leading-relaxed font-extralight text-balance">High-performance agentic runtime built on <span class="text-cyan-brand font-normal">@solana/kit</span> and <span class="text-cyan-brand font-normal">Bun</span>.
        Typed actions, composable routines, event triggers, and full operator control from the command line.</p> <div class="flex flex-col sm:flex-row gap-4 justify-center mb-16"><a${attr("href", githubUrl)} target="_blank" rel="noopener noreferrer" class="px-8 py-3 bg-cyan-brand text-background font-bold hover:bg-purple-brand transition-colors flex items-center justify-center gap-2 group">Get Started <svg class="w-4 h-4 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"></path></svg></a> <a${attr("href", `${stringify(githubUrl)}#readme`)} target="_blank" rel="noopener noreferrer" class="px-8 py-3 border-2 border-cyan-brand text-cyan-brand hover:bg-border-subtle transition-colors flex items-center justify-center gap-2 font-light"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg> Documentation</a></div> <div class="grid grid-cols-3 gap-4 md:gap-8 mt-16 pt-16 border-t border-border-subtle"><div><div class="text-2xl md:text-3xl font-black text-cyan-brand mb-2">~100KB</div> <div class="text-xs text-muted-dark font-extralight tracking-wide uppercase">Solana Kit Bundle</div></div> <div><div class="text-2xl md:text-3xl font-black text-purple-brand mb-2">Zero Deps</div> <div class="text-xs text-muted-dark font-extralight tracking-wide uppercase">Web3.js Legacy Free</div></div> <div><div class="text-2xl md:text-3xl font-black text-cyan-brand mb-2">Modular</div> <div class="text-xs text-muted-dark font-extralight tracking-wide uppercase">Tree-Shakeable</div></div></div></div></section> <section class="max-w-6xl mx-auto px-6 py-20 border-t border-border-subtle"><h2 class="text-5xl md:text-6xl font-black mb-4 text-center tracking-tight">Built for <span class="text-cyan-brand">Production</span></h2> <p class="text-center text-muted mb-16 text-sm max-w-2xl mx-auto font-extralight leading-relaxed">Schema-driven orchestration with TypeScript, Solana Kit, and Bun. No legacy dependencies. Operator-first design.</p> <div class="grid md:grid-cols-3 gap-8"><!--[-->`);
  const each_array = ensure_array_like(features);
  for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
    let feat = each_array[$$index];
    $$renderer.push(`<div${attr_class(`p-8 border ${stringify(feat.color === "cyan" ? "border-border-subtle hover:border-cyan-brand" : "border-border-subtle hover:border-purple-brand")} transition-colors`)}><div${attr_class(`w-12 h-12 ${stringify(feat.color === "cyan" ? "bg-cyan-brand" : "bg-purple-brand")} flex items-center justify-center mb-4`)}>`);
    if (feat.color === "cyan") {
      $$renderer.push("<!--[-->");
      $$renderer.push(`<svg class="w-6 h-6 text-background" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>`);
    } else {
      $$renderer.push("<!--[!-->");
      $$renderer.push(`<svg class="w-6 h-6 text-background" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`);
    }
    $$renderer.push(`<!--]--></div> <h3 class="text-base font-bold mb-3">${escape_html(feat.label)}</h3> <p class="text-muted font-extralight text-sm leading-relaxed">${escape_html(feat.description)}</p></div>`);
  }
  $$renderer.push(`<!--]--></div></section> <section class="max-w-6xl mx-auto px-6 py-20 border-t border-border-subtle"><div class="grid md:grid-cols-2 gap-12 items-start"><div><h2 class="text-5xl md:text-6xl font-black mb-6 tracking-tight">What you get with <span class="text-cyan-brand">TrenchClaw</span></h2> <ul class="space-y-4"><!--[-->`);
  const each_array_1 = ensure_array_like(checklist);
  for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
    let item = each_array_1[$$index_1];
    $$renderer.push(`<li class="flex gap-3 text-sm text-muted font-extralight leading-relaxed"><span${attr_class(`font-black ${stringify(item.color === "cyan" ? "text-cyan-brand" : "text-purple-brand")} shrink-0`)}>✓</span> <span>${escape_html(item.text)}</span></li>`);
  }
  $$renderer.push(`<!--]--></ul></div> <div class="border border-border-subtle"><div class="border-b border-border-subtle px-4 py-2 flex items-center gap-2"><div class="w-2.5 h-2.5 bg-muted-dark"></div> <div class="w-2.5 h-2.5 bg-muted-dark"></div> <div class="w-2.5 h-2.5 bg-muted-dark"></div> <span class="ml-2 text-xs text-muted-dark font-mono">trenchclaw — operator@cli</span></div> <div class="p-6 font-mono text-sm space-y-1.5 overflow-x-auto"><p><span class="text-muted-dark">$</span> <span class="text-foreground font-extralight">bun run src/cli.ts start</span></p> <p class="text-muted-dark font-extralight">Loading runtime config...</p> <p><span class="text-cyan-brand">✓</span> <span class="text-muted font-extralight">Wallet keypair loaded</span></p> <p><span class="text-cyan-brand">✓</span> <span class="text-muted font-extralight">Solana Kit initialized</span></p> <p><span class="text-cyan-brand">✓</span> <span class="text-muted font-extralight">RPC connection verified</span></p> <p><span class="text-purple-brand">✓</span> <span class="text-muted font-extralight">SQLite schema synced</span></p> <p><span class="text-purple-brand">✓</span> <span class="text-muted font-extralight">Zod schemas registered</span></p> <p><span class="text-purple-brand">✓</span> <span class="text-muted font-extralight">AI SDK orchestrator ready</span></p> <p class="pt-1"><span class="text-cyan-brand">→</span> <span class="text-foreground font-light">Listening for triggers...</span></p> <p class="text-muted-dark font-extralight pt-2">[DCA routine] next execution in 14m 22s</p> <p class="text-muted-dark font-extralight">[Price trigger] SOL target: $185.00 | current: $178.42</p></div></div></div></section> <section class="max-w-6xl mx-auto px-6 py-20 border-t border-border-subtle"><h2 class="text-5xl font-black mb-4 text-center tracking-tight">Technology Stack</h2> <p class="text-center text-muted mb-16 text-sm max-w-2xl mx-auto font-extralight leading-relaxed">Every dependency is intentional. No legacy baggage. Built on the fastest, most modern primitives available in 2026.</p> <div class="grid md:grid-cols-2 gap-px bg-border-subtle"><!--[-->`);
  const each_array_2 = ensure_array_like(stack);
  for (let $$index_3 = 0, $$length = each_array_2.length; $$index_3 < $$length; $$index_3++) {
    let group = each_array_2[$$index_3];
    $$renderer.push(`<div class="bg-background p-8"><h3 class="text-xs font-bold tracking-widest uppercase text-cyan-brand mb-6">${escape_html(group.category)}</h3> <div class="space-y-5"><!--[-->`);
    const each_array_3 = ensure_array_like(group.items);
    for (let $$index_2 = 0, $$length2 = each_array_3.length; $$index_2 < $$length2; $$index_2++) {
      let item = each_array_3[$$index_2];
      $$renderer.push(`<div class="flex items-start justify-between gap-4"><div><a${attr("href", item.url)} target="_blank" rel="noopener noreferrer" class="text-sm font-semibold text-foreground hover:text-cyan-brand transition-colors">${escape_html(item.name)}</a> <p class="text-xs text-muted-dark font-extralight mt-0.5 leading-relaxed">${escape_html(item.description)}</p></div> <svg class="w-3 h-3 text-muted-dark shrink-0 mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 17L17 7M17 7H7M17 7v10"></path></svg></div>`);
    }
    $$renderer.push(`<!--]--></div></div>`);
  }
  $$renderer.push(`<!--]--></div></section> <section class="max-w-6xl mx-auto px-6 py-20 border-t border-border-subtle"><h2 class="text-5xl font-black mb-4 text-center tracking-tight">Solana Kit-Native</h2> <p class="text-center text-muted mb-12 text-sm font-extralight leading-relaxed">TrenchClaw uses modern @solana/kit. No legacy web3.js. No unnecessary dependencies.</p> <div class="border border-border-subtle overflow-hidden"><table class="w-full text-sm"><thead><tr class="border-b border-border-subtle"><th class="px-6 py-4 text-left font-bold text-xs tracking-widest uppercase text-muted">Feature</th><th class="px-6 py-4 text-center font-bold text-xs tracking-widest uppercase text-cyan-brand">TrenchClaw</th><th class="px-6 py-4 text-center font-bold text-xs tracking-widest uppercase text-muted-dark">Legacy Approach</th></tr></thead><tbody><!--[-->`);
  const each_array_4 = ensure_array_like(comparison);
  for (let i = 0, $$length = each_array_4.length; i < $$length; i++) {
    let row = each_array_4[i];
    $$renderer.push(`<tr${attr_class(i < comparison.length - 1 ? "border-b border-border-subtle" : "")}><td class="px-6 py-4 text-muted font-extralight text-sm">${escape_html(row.feature)}</td><td class="px-6 py-4 text-center text-cyan-brand font-extralight text-sm">${escape_html(row.tc)}</td><td class="px-6 py-4 text-center text-muted-dark font-extralight text-sm">${escape_html(row.legacy)}</td></tr>`);
  }
  $$renderer.push(`<!--]--></tbody></table></div></section> <section class="max-w-6xl mx-auto px-6 py-20 border-t border-border-subtle"><div class="bg-background border border-border-subtle p-16 text-center"><h2 class="text-5xl font-black mb-4 tracking-tight">Ready to Build?</h2> <p class="text-sm text-muted mb-10 max-w-xl mx-auto font-extralight leading-relaxed">Join operators building the future of Solana agents. TrenchClaw is ready for the dangerous work.</p> <a${attr("href", githubUrl)} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-8 py-3 bg-cyan-brand text-background font-bold hover:bg-purple-brand transition-colors group">Get Started on GitHub <svg class="w-4 h-4 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"></path></svg></a></div></section> <footer class="px-6"><div class="flex justify-center py-16 border-t border-border-subtle"><img src="/trenchclaw.png" alt="TrenchClaw" class="w-72 md:w-[480px] object-contain opacity-80" width="480" height="200"/></div> <div class="border-t border-border-subtle py-8 max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center"><p class="text-xs text-muted-dark font-extralight">© 2026 TrenchClaw. MIT License (coming soon).</p> <div class="flex gap-6 mt-4 md:mt-0"><a${attr("href", githubUrl)} target="_blank" rel="noopener noreferrer" class="text-xs text-muted-dark hover:text-cyan-brand transition-colors font-extralight">GitHub</a> <a${attr("href", `${stringify(githubUrl)}#readme`)} target="_blank" rel="noopener noreferrer" class="text-xs text-muted-dark hover:text-cyan-brand transition-colors font-extralight">Read Me</a> <a${attr("href", `${stringify(githubUrl)}/blob/main/ARCHITECTURE.md`)} target="_blank" rel="noopener noreferrer" class="text-xs text-muted-dark hover:text-cyan-brand transition-colors font-extralight">Architecture</a></div></div></footer></div>`);
}
export {
  _page as default
};
